"use client";

import { useState, useTransition } from "react";
import { Store, MapPin, X } from "lucide-react";
import { Card, Label, Body, Btn, Mono } from "@/components/ds";
import {
  searchKrogerLocations,
  savePreferredKrogerLocation,
  clearPreferredKrogerLocation,
} from "@/app/(app)/me/actions";

interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface KrogerSectionProps {
  initialLocationId: string | null;
  initialLocationName: string | null;
  initialZip: string | null;
}

// Picker for the user's home Kroger / Smith's store. /shop uses this to
// fetch real prices + aisles for items on the grocery list. The picker
// silently no-ops if Kroger creds aren't configured server-side — the
// search action returns an error string in that case.
export function KrogerSection({
  initialLocationId,
  initialLocationName,
  initialZip,
}: KrogerSectionProps) {
  const [zip, setZip] = useState(initialZip ?? "");
  const [results, setResults] = useState<KrogerLocation[]>([]);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(initialLocationId);
  const [savedName, setSavedName] = useState<string | null>(initialLocationName);
  const [error, setError] = useState<string | null>(null);

  function search() {
    setError(null);
    setResults([]);
    if (!/^\d{5}$/.test(zip.trim())) {
      setError("Enter a 5-digit ZIP.");
      return;
    }
    startSearch(async () => {
      const r = await searchKrogerLocations(zip.trim());
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.stores.length === 0) {
        setError("No Kroger-family stores within 15 miles of that ZIP.");
        return;
      }
      setResults(r.stores);
    });
  }

  function pick(loc: KrogerLocation) {
    setError(null);
    startSave(async () => {
      const r = await savePreferredKrogerLocation({
        locationId: loc.locationId,
        locationName: `${loc.name} — ${loc.address}, ${loc.city}`,
        zip: zip.trim(),
      });
      if (r?.error) {
        setError(r.error);
        return;
      }
      setSavedId(loc.locationId);
      setSavedName(`${loc.name} — ${loc.address}, ${loc.city}`);
      setResults([]);
    });
  }

  function clear() {
    startSave(async () => {
      await clearPreferredKrogerLocation();
      setSavedId(null);
      setSavedName(null);
      setResults([]);
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>store</Label>
        {error ? (
          <Body size="xs" className="text-danger">
            {error}
          </Body>
        ) : null}
      </div>

      {savedId && savedName ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Store size={16} className="text-accent shrink-0 mt-1" />
            <div className="min-w-0">
              <Body size="sm" className="text-ink">
                {savedName}
              </Body>
              <Body size="xs" dim>
                /shop will pull real prices + aisles from this store.
              </Body>
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="text-ink-3 hover:text-ink p-1 rounded-full"
            aria-label="clear store"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <Body size="xs" dim>
            Pick your home Kroger / Smith&apos;s / Fry&apos;s / King Soopers
            store and /shop will price your weekly list against that store&apos;s
            actual catalog.
          </Body>
          <div className="flex gap-2">
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              placeholder="ZIP code"
              maxLength={5}
              inputMode="numeric"
              className="flex-1 px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
            />
            <Btn
              variant="outline"
              onClick={search}
              disabled={searching || !zip.trim()}
            >
              {searching ? "Searching…" : "Search"}
            </Btn>
          </div>

          {results.length > 0 ? (
            <ul className="flex flex-col gap-1 mt-1 border-t border-ink-l/40 pt-3">
              {results.map((loc) => (
                <li key={loc.locationId}>
                  <button
                    type="button"
                    onClick={() => pick(loc)}
                    disabled={saving}
                    className="w-full text-left flex items-start gap-2 py-2 px-2 rounded-thumb hover:bg-paper-2 transition-colors disabled:opacity-50"
                  >
                    <MapPin size={14} className="text-ink-3 shrink-0 mt-1" />
                    <div className="min-w-0 flex-1">
                      <Body size="sm" className="text-ink">
                        {loc.name}
                      </Body>
                      <div className="flex items-center gap-2 text-ink-3 text-[11px] mt-0.5">
                        <Mono>{loc.chain}</Mono>
                        <span>·</span>
                        <span>
                          {loc.address}, {loc.city} {loc.state}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}
