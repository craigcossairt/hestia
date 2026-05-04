"use client";

import { useEffect, useState, useTransition } from "react";
import { ShoppingCart, ExternalLink, Check } from "lucide-react";
import { Btn, Body } from "@/components/ds";
import { sendToKrogerCart } from "@/app/(app)/shop/actions";

interface SendToCartProps {
  // Names of items currently on the shopping list. We send these to
  // the server action, which translates them to UPCs via the Phase 1
  // price cache.
  itemNames: string[];
  // Whether the viewer has already connected their Kroger account.
  // Drives the button label (Connect vs Send).
  isConnected: boolean;
}

// /shop button that pushes the list to the user's Kroger cart. First
// click for an unconnected user redirects through the OAuth flow;
// after coming back successfully, the Phase 1 connection-state prop
// flips to true and the second click actually sends.
export function SendToCart({ itemNames, isConnected }: SendToCartProps) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; added: number; total: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Surface the OAuth callback's status banner. /api/kroger/oauth/callback
  // redirects back here with ?kroger=connected or ?kroger=error&reason=...
  // — display it briefly then strip the params from the URL so a refresh
  // doesn't keep showing the message. Read window.location directly to
  // avoid Next 16's Suspense requirement on useSearchParams in a child
  // of a dynamic server component.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("kroger");
    if (!flag) return;
    if (flag === "connected") {
      setStatus({ kind: "ok", added: 0, total: 0 });
      setTimeout(() => setStatus({ kind: "idle" }), 4000);
    } else if (flag === "error") {
      const reason = url.searchParams.get("reason") || "unknown";
      setStatus({
        kind: "error",
        message:
          reason === "access_denied"
            ? "You declined the Kroger connection."
            : `Kroger sign-in failed (${reason}).`,
      });
    }
    url.searchParams.delete("kroger");
    url.searchParams.delete("reason");
    const cleaned = url.pathname + (url.search ? url.search : "");
    window.history.replaceState({}, "", cleaned);
  }, []);

  function send() {
    if (!isConnected) {
      // Kick off the OAuth dance. Server sets cookies + redirects to
      // Kroger; callback returns the user to /shop with ?kroger=connected.
      window.location.href = `/api/kroger/oauth/start?return=${encodeURIComponent("/shop")}`;
      return;
    }
    setStatus({ kind: "idle" });
    start(async () => {
      const r = await sendToKrogerCart(itemNames);
      if ("ok" in r && r.ok) {
        setStatus({ kind: "ok", added: r.added, total: r.total });
        return;
      }
      if ("needsAuth" in r && r.needsAuth) {
        // Token expired between page load and click — restart auth.
        window.location.href = `/api/kroger/oauth/start?return=${encodeURIComponent("/shop")}`;
        return;
      }
      setStatus({
        kind: "error",
        message: ("error" in r && r.error) || "Send failed.",
      });
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Btn
        variant={isConnected ? "primary" : "outline"}
        size="sm"
        onClick={send}
        disabled={pending || itemNames.length === 0}
      >
        <span className="inline-flex items-center gap-1.5">
          <ShoppingCart size={14} />
          {pending
            ? "Sending…"
            : isConnected
              ? "Send to Kroger Cart"
              : "Connect Kroger to send"}
        </span>
      </Btn>
      {isConnected ? (
        <a
          href="https://www.kroger.com/cart"
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink-3 hover:text-ink text-[12px] inline-flex items-center gap-1"
        >
          Open cart on kroger.com <ExternalLink size={11} />
        </a>
      ) : null}
      {status.kind === "ok" && status.total === 0 ? (
        <Body size="xs" className="text-success inline-flex items-center gap-1">
          <Check size={12} /> Connected. Click again to send your list.
        </Body>
      ) : null}
      {status.kind === "ok" && status.total > 0 ? (
        <Body size="xs" className="text-success inline-flex items-center gap-1">
          <Check size={12} /> Added {status.added} of {status.total} items to your
          cart.
        </Body>
      ) : null}
      {status.kind === "error" ? (
        <Body size="xs" className="text-danger">
          {status.message}
        </Body>
      ) : null}
    </div>
  );
}
