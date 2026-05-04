// Kroger cart write API. Uses the user-level access token from
// lib/kroger/oauth.ts.
//
// Endpoint: PUT /v1/cart/add
// Auth:     Bearer <user_access_token>
// Body:     { items: [{ upc: string, quantity: number, modality: 'PICKUP'|'DELIVERY' }] }
// Returns:  204 on success
//
// Kroger rejects items with no UPC and silently ignores items whose
// UPC isn't in the requested store's catalog. We surface the count of
// "couldn't add" items so the user knows the cart isn't quite a 1:1
// reflection of their list.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureValidUserToken } from "./oauth";

const KROGER_BASE = "https://api.kroger.com/v1";

export interface CartItem {
  upc: string;
  quantity: number;
}

export interface AddToCartResult {
  ok: boolean;
  // High-level reason on failure. Caller maps to a user-facing message.
  // - "no-token": user hasn't connected Kroger yet (start the OAuth flow)
  // - "auth": refresh failed; user must reconnect
  // - "empty": no UPCs to send
  // - "api": Kroger rejected the request
  reason?: "no-token" | "auth" | "empty" | "api";
  // Number of items the call succeeded for (Kroger doesn't break it
  // down per-item, so we count what we sent if 204'd).
  added?: number;
  status?: number;
}

export async function addToCart(args: {
  supabase: SupabaseClient;
  userId: string;
  items: CartItem[];
  modality?: "PICKUP" | "DELIVERY";
}): Promise<AddToCartResult> {
  const items = args.items.filter((i) => i.upc && i.quantity > 0);
  if (items.length === 0) return { ok: false, reason: "empty" };

  const token = await ensureValidUserToken({
    supabase: args.supabase,
    userId: args.userId,
  });
  if (!token) return { ok: false, reason: "no-token" };

  const res = await fetch(`${KROGER_BASE}/cart/add`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      items: items.map((i) => ({
        upc: i.upc,
        quantity: i.quantity,
        modality: args.modality ?? "PICKUP",
      })),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  // 204 No Content on success. 401 means our token expired between
  // the refresh check and the call — caller should re-auth.
  if (res.status === 204) return { ok: true, added: items.length };
  if (res.status === 401) return { ok: false, reason: "auth", status: 401 };
  return { ok: false, reason: "api", status: res.status };
}
