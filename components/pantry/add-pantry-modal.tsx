"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  H,
  Body,
  Btn,
  Label,
  Mono,
  Chip,
} from "@/components/ds";
import {
  addPantryItem,
  bulkAddPantryItems,
} from "@/app/(app)/pantry/actions";
import { BarcodeScanner } from "./barcode-scanner";
import { cn } from "@/lib/utils";
import type { PantryLocation } from "@/lib/types/database";

type Mode = "manual" | "bulk" | "barcode" | "receipt";

const MODES: { id: Mode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "bulk", label: "Bulk paste" },
  { id: "barcode", label: "Barcode" },
  { id: "receipt", label: "Receipt" },
];

const QUICK_ADDS = [
  "eggs",
  "milk",
  "bread",
  "chicken",
  "rice",
  "olive oil",
  "garlic",
  "onion",
  "pasta",
  "spinach",
  "yogurt",
  "salt",
];

interface AddPantryModalProps {
  open: boolean;
  onClose: () => void;
  defaultLocation?: PantryLocation;
}

export function AddPantryModal({
  open,
  onClose,
  defaultLocation = "pantry",
}: AddPantryModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("manual");

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label>add to pantry</Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            Close
          </button>
        </div>
        <H size="md" as="h2">
          How would you like to add?
        </H>
        <div className="grid grid-cols-4 gap-1 p-1 bg-paper-2 rounded-thumb">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "px-3 py-2 rounded-thumb font-sans text-[12.5px] transition-colors",
                mode === m.id
                  ? "bg-card text-ink shadow-[var(--shadow-1)]"
                  : "text-ink-3",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "manual" && (
          <ManualMode
            defaultLocation={defaultLocation}
            onSaved={() => {
              router.refresh();
            }}
          />
        )}
        {mode === "bulk" && (
          <BulkMode
            onSaved={() => {
              router.refresh();
              onClose();
            }}
          />
        )}
        {mode === "barcode" && (
          <BarcodeMode
            onSaved={() => {
              router.refresh();
            }}
          />
        )}
        {mode === "receipt" && (
          <ReceiptMode
            onSaved={() => {
              router.refresh();
              onClose();
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

function ManualMode({
  defaultLocation,
  onSaved,
}: {
  defaultLocation: PantryLocation;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("each");
  const [location, setLocation] = useState<PantryLocation>(defaultLocation);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(itemName?: string) {
    setError(null);
    const finalName = (itemName ?? name).trim();
    if (!finalName) {
      setError("Name required.");
      return;
    }
    start(async () => {
      const result = await addPantryItem({
        name: finalName,
        qty: Number(qty) || 1,
        unit,
        location,
      });
      if (result?.error) setError(result.error);
      else {
        if (!itemName) setName("");
        onSaved();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[2fr_60px_80px] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        />
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent text-center"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="px-2 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[12px] outline-none focus:border-accent"
        >
          {[
            "each",
            "g",
            "kg",
            "oz",
            "lb",
            "cup",
            "tbsp",
            "tsp",
            "ml",
            "l",
            "can",
            "box",
            "bag",
            "bottle",
          ].map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        {(["pantry", "fridge", "freezer", "spices"] as const).map((l) => (
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
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => save()} disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </Btn>
      </div>
      <div className="border-t border-ink-l/40 pt-3">
        <Label>quick add</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {QUICK_ADDS.map((q) => (
            <Chip key={q} variant="default" interactive onClick={() => save(q)}>
              + {q}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ParsedItem {
  name: string;
  qty: number;
  unit: string;
  location: PantryLocation;
}

function BulkMode({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function parse() {
    setError(null);
    setParsing(true);
    setParsed(null);
    try {
      const res = await fetch("/api/ai/pantry-bulk-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setParsed(json.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!parsed) return;
    start(async () => {
      const result = await bulkAddPantryItems(parsed, "bulk");
      if (result?.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste anything — receipts, brain dumps:\n2 doz eggs\n1 lb chicken\nyogurt × 4\nspinach\nolive oil"}
        rows={6}
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
      />
      <div className="flex gap-2">
        <Btn variant="primary" onClick={parse} disabled={parsing || text.trim().length < 3}>
          {parsing ? "Parsing…" : "Parse with Hestia"}
        </Btn>
        {parsed ? (
          <Btn variant="outline" onClick={save} disabled={pending}>
            {pending ? "Adding…" : `Add ${parsed.length} items`}
          </Btn>
        ) : null}
      </div>
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {parsed ? <ParsedItemsGrid items={parsed} setItems={setParsed} /> : null}
    </div>
  );
}

function ParsedItemsGrid({
  items,
  setItems,
}: {
  items: ParsedItem[];
  setItems: (next: ParsedItem[]) => void;
}) {
  return (
    <div className="flex flex-col rounded-card border border-ink-l overflow-hidden">
      {items.map((it, i) => (
        <div
          key={i}
          className="grid grid-cols-[2fr_60px_80px_100px_30px] gap-2 px-3 py-2 border-b border-ink-l/40 last:border-b-0 items-center"
        >
          <input
            value={it.name}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, name: e.target.value };
              setItems(next);
            }}
            className="bg-transparent text-ink font-sans text-[13px] outline-none"
          />
          <input
            value={it.qty}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, qty: Number(e.target.value) || 1 };
              setItems(next);
            }}
            inputMode="decimal"
            className="bg-transparent text-ink font-mono text-[13px] outline-none text-center"
          />
          <input
            value={it.unit}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, unit: e.target.value };
              setItems(next);
            }}
            className="bg-transparent text-ink font-mono text-[12px] outline-none"
          />
          <select
            value={it.location}
            onChange={(e) => {
              const next = [...items];
              next[i] = {
                ...it,
                location: e.target.value as PantryLocation,
              };
              setItems(next);
            }}
            className="bg-transparent text-ink font-sans text-[12px] outline-none capitalize"
          >
            {(["pantry", "fridge", "freezer", "spices"] as const).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            className="text-ink-3 hover:text-danger text-[14px]"
            aria-label="remove"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function BarcodeMode({ onSaved }: { onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <BarcodeScanner
      onResult={(item) => {
        setError(null);
        start(async () => {
          const result = await addPantryItem({
            name: item.name,
            qty: item.qty ?? 1,
            unit: item.unit ?? "each",
            location: item.location ?? "pantry",
            source: "scan",
            photo_url: item.photoUrl ?? null,
          });
          if (result?.error) setError(result.error);
          else onSaved();
        });
      }}
    />
  );
}

function ReceiptMode({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    setParsed(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setPreviewUrl(dataUrl);
      const res = await fetch("/api/ai/pantry-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_url: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setParsed(json.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!parsed) return;
    start(async () => {
      const result = await bulkAddPantryItems(parsed, "receipt");
      if (result?.error) setError(result.error);
      else onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />
      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => inputRef.current?.click()} disabled={parsing}>
          {parsing ? "Reading…" : previewUrl ? "Another receipt" : "Upload receipt"}
        </Btn>
        {parsed ? (
          <Btn variant="outline" onClick={save} disabled={pending}>
            {pending ? "Adding…" : `Add ${parsed.length} items`}
          </Btn>
        ) : null}
      </div>
      {previewUrl ? (
        <div className="rounded-card overflow-hidden border border-ink-l max-h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="receipt"
            className="w-full max-h-64 object-cover object-top"
          />
        </div>
      ) : null}
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {parsed ? (
        <>
          <Mono className="text-ink-3 text-[11px]">Tap any field to edit</Mono>
          <ParsedItemsGrid items={parsed} setItems={setParsed} />
        </>
      ) : null}
    </div>
  );
}
