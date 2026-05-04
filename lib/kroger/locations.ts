// Kroger / Smith's location lookup. Used by the /me store picker so the
// user can pick which physical store backs their /shop pricing.
//
// Smith's Food & Drug is part of the Kroger family — their locations
// come back with chain="SMITHS". We surface all chains so the user can
// pick whatever's closest (Kroger, Smith's, Fry's, King Soopers, etc.).

import { krogerFetch } from "./client";

export interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string; // "SMITHS", "KROGER", "FRYS", etc.
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  // Approximate driving distance from the searched zip, in miles. Kroger
  // doesn't return this directly — we sort by their internal distance
  // which is a reasonable proxy.
}

interface RawLocation {
  locationId: string;
  chain?: string;
  name?: string;
  address?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  phone?: string;
}

interface RawLocationsResponse {
  data?: RawLocation[];
}

// Search nearby stores by ZIP code. Returns up to `limit` locations
// sorted by Kroger's internal proximity. Empty array means either no
// nearby stores or Kroger creds aren't configured.
export async function searchLocations(args: {
  zip: string;
  radiusMiles?: number;
  limit?: number;
}): Promise<KrogerLocation[]> {
  const zip = args.zip.trim();
  if (!/^\d{5}$/.test(zip)) return [];

  const json = await krogerFetch<RawLocationsResponse>({
    path: "/locations",
    scope: "", // public endpoint
    query: {
      "filter.zipCode.near": zip,
      "filter.radiusInMiles": args.radiusMiles ?? 15,
      "filter.limit": args.limit ?? 10,
    },
  });
  if (!json?.data) return [];

  return json.data
    .filter((l) => !!l.locationId && !!l.address?.addressLine1)
    .map((l) => ({
      locationId: l.locationId,
      name: l.name ?? l.chain ?? "Store",
      chain: l.chain ?? "KROGER",
      address: l.address?.addressLine1 ?? "",
      city: l.address?.city ?? "",
      state: l.address?.state ?? "",
      zip: l.address?.zipCode ?? "",
      phone: l.phone ?? null,
    }));
}
