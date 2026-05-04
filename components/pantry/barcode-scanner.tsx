"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Body, Btn, Chip, Label, Mono } from "@/components/ds";
import type { PantryLocation } from "@/lib/types/database";
import { cn } from "@/lib/utils";

// What the parent (BarcodeMode) does when the user taps "Add". The
// parent owns persistence + revalidation + success messaging, so this
// scanner stays purely about the scan + review UX.
export type BarcodeAddHandler = (item: {
  name: string;
  qty: number;
  unit: string;
  location: PantryLocation;
  photoUrl: string | null;
  source: "scan" | "manual";
}) => Promise<{ ok: true; summary: string } | { ok: false; error: string }>;

interface BarcodeScannerProps {
  onAdd: BarcodeAddHandler;
}

interface LookupResult {
  found: boolean;
  code: string;
  name?: string;
  brand?: string | null;
  qty?: number;
  unit?: string;
  photo_url?: string | null;
  location?: PantryLocation;
  quantity_text?: string | null;
  error?: string;
}

const UNIT_OPTIONS = [
  "each",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "gallon",
  "fl oz",
  "cup",
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
] as const;

const LOCATIONS: PantryLocation[] = ["pantry", "fridge", "freezer", "spices"];

// Reused between auto-restart-after-add and the explicit "Scan another"
// button. Resets the camera + clears any previous result so the next
// scan triggers a fresh lookup. Without this clear, scanning the same
// item back-to-back is a silent no-op (React bails on identical state).
type Stage =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "looking" }
  | { kind: "preview"; result: LookupResult }
  | { kind: "added"; summary: string };

export function BarcodeScanner({ onAdd }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [sessionAdded, setSessionAdded] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  // Lookup is declared before the camera effect so the linter sees
  // the reference order is right (function declarations hoist at
  // runtime, but eslint's react-hooks/immutability rule wants source
  // order to match).
  async function runLookup(code: string) {
    try {
      const res = await fetch(`/api/pantry/barcode?code=${encodeURIComponent(code)}`);
      const json: LookupResult = await res.json();
      if (res.ok && json.found) {
        setStage({ kind: "preview", result: json });
      } else if (res.status === 404) {
        // Not in OFF — let the user fill in name + add it anyway with
        // the barcode preserved (would let us submit the barcode back
        // to OFF later if we want; not done today).
        setStage({
          kind: "preview",
          result: { found: false, code, location: "pantry", qty: 1, unit: "each" },
        });
      } else {
        setError(json.error ?? "Lookup failed.");
        setStage({ kind: "idle" });
      }
    } catch (err) {
      setError(`Lookup failed: ${(err as Error).message}`);
      setStage({ kind: "idle" });
    }
  }

  // Camera lifecycle. Tearing down on every stage change instead of
  // leaving the stream running silently in the background — saves
  // battery + makes the "scan again" tap an explicit user gesture.
  // Error reset happens in the click handler that initiated scanning,
  // not here — keeps the effect a pure subscription.
  useEffect(() => {
    if (stage.kind !== "scanning") return;
    const reader = new BrowserMultiFormatReader();
    let stop: (() => void) | undefined;

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result, _err, ctrls) => {
            if (result) {
              ctrls.stop();
              const code = result.getText();
              setStage({ kind: "looking" });
              void runLookup(code);
            }
          },
        );
        stop = () => controls.stop();
      } catch (err) {
        setError(`Camera: ${(err as Error).message}`);
        setStage({ kind: "idle" });
      }
    })();

    return () => {
      stop?.();
    };
  }, [stage.kind]);

  function startScanning() {
    setError(null);
    setStage({ kind: "scanning" });
  }

  async function handleAdd(item: {
    name: string;
    qty: number;
    unit: string;
    location: PantryLocation;
    photoUrl: string | null;
    source: "scan" | "manual";
  }) {
    setPending(true);
    setError(null);
    const result = await onAdd(item);
    setPending(false);
    if (result.ok) {
      setSessionAdded((prev) => [...prev, result.summary]);
      // Show a success state briefly, then auto-restart camera so the
      // next item is one tap away. The previous flow stopped here and
      // showed a "Start camera" button — the dead air is what made
      // people re-scan duplicates.
      setStage({ kind: "added", summary: result.summary });
      window.setTimeout(() => {
        setStage((s) => (s.kind === "added" ? { kind: "scanning" } : s));
      }, 1200);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>scan barcode</Label>

      <div className="aspect-video rounded-card overflow-hidden bg-paper-3 border border-ink-l relative">
        <video
          ref={videoRef}
          className={cn(
            "w-full h-full object-cover",
            stage.kind !== "scanning" && "hidden",
          )}
          playsInline
          muted
        />
        {stage.kind === "idle" ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
            <Body size="sm" dim>
              {sessionAdded.length === 0
                ? "Camera ready when you are."
                : "Scan another or close the modal when you're done."}
            </Body>
          </div>
        ) : null}
        {stage.kind === "looking" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-paper/80">
            <Body size="sm" dim>Looking up…</Body>
          </div>
        ) : null}
        {stage.kind === "added" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-success/15 px-4 text-center">
            <Body size="sm" className="text-success font-medium">
              ✓ {stage.summary}
            </Body>
          </div>
        ) : null}
      </div>

      {error ? (
        <Body size="sm" className="text-danger">
          {error}
        </Body>
      ) : null}

      {stage.kind === "preview" ? (
        <PreviewCard
          result={stage.result}
          pending={pending}
          onCancel={startScanning}
          onAdd={handleAdd}
        />
      ) : null}

      {stage.kind === "idle" ? (
        <div className="flex gap-2">
          <Btn variant="primary" onClick={startScanning}>
            {sessionAdded.length === 0 ? "Start camera" : "Scan another"}
          </Btn>
        </div>
      ) : null}

      {stage.kind === "scanning" ? (
        <div className="flex gap-2">
          <Btn variant="outline" onClick={() => setStage({ kind: "idle" })}>
            Stop camera
          </Btn>
        </div>
      ) : null}

      {sessionAdded.length > 0 ? (
        <div className="border-t border-ink-l/40 pt-3 flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <Label>added this session</Label>
            <Mono className="text-ink-3 text-[10px]">{sessionAdded.length}</Mono>
          </div>
          <ul className="flex flex-col gap-0.5 max-h-32 overflow-auto">
            {sessionAdded
              .slice()
              .reverse()
              .map((line, i) => (
                <li key={`${i}-${line}`} className="text-ink-2 text-[12px] font-sans">
                  ✓ {line}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PreviewCard({
  result,
  pending,
  onCancel,
  onAdd,
}: {
  result: LookupResult;
  pending: boolean;
  onCancel: () => void;
  onAdd: (item: {
    name: string;
    qty: number;
    unit: string;
    location: PantryLocation;
    photoUrl: string | null;
    source: "scan" | "manual";
  }) => Promise<void>;
}) {
  const [name, setName] = useState((result.name ?? "").toString());
  const [qty, setQty] = useState(String(result.qty ?? 1));
  const [unit, setUnit] = useState((result.unit ?? "each") as string);
  const [location, setLocation] = useState<PantryLocation>(
    result.location ?? "pantry",
  );

  const ready = name.trim().length > 0 && Number(qty) > 0;

  return (
    <div className="rounded-card border border-ink-l bg-card p-4 flex flex-col gap-3">
      <div className="flex gap-3 items-start">
        {result.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.photo_url}
            alt={result.name ?? "product"}
            className="w-16 h-16 rounded-thumb object-cover bg-paper-3"
          />
        ) : (
          <div className="w-16 h-16 rounded-thumb bg-paper-3 flex items-center justify-center">
            <Body size="xs" dim>
              {result.found ? "no img" : "?"}
            </Body>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {result.found ? (
            <>
              <Body size="xs" dim className="truncate">
                {result.brand ? `${result.brand} · ` : ""}
                code {result.code}
                {result.quantity_text ? ` · ${result.quantity_text}` : ""}
              </Body>
            </>
          ) : (
            <Body size="xs" className="text-ink-3">
              Code {result.code} not in Open Food Facts. Fill in the name to
              add it manually.
            </Body>
          )}
        </div>
      </div>

      {/* Name on its own row — keeps the input wide enough to actually
          edit on a phone. Qty + unit go on a second row where they
          always fit even at 360px viewport widths. The previous 3-col
          grid pushed the unit dropdown off-screen on iPhone Mini. */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name"
        className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent w-full"
        autoFocus={!result.found}
      />
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          aria-label="Quantity"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent text-center min-w-0"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          aria-label="Unit"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[13px] outline-none focus:border-accent min-w-0"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {LOCATIONS.map((l) => (
          <Chip
            key={l}
            variant={location === l ? "fill" : "default"}
            interactive
            onClick={() => setLocation(l)}
            className="capitalize"
          >
            {l}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2">
        <Btn
          variant="primary"
          onClick={() =>
            onAdd({
              name: name.trim(),
              qty: Number(qty) || 1,
              unit,
              location,
              photoUrl: result.photo_url ?? null,
              source: result.found ? "scan" : "manual",
            })
          }
          disabled={pending || !ready}
        >
          {pending ? "Adding…" : "Add to inventory"}
        </Btn>
        <Btn variant="outline" onClick={onCancel} disabled={pending}>
          Cancel & rescan
        </Btn>
      </div>
    </div>
  );
}
