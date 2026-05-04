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
import { Select } from "@/components/ds/select";
import {
  addOrIncrementPantryItem,
  addPantryItem,
  bulkAddPantryItems,
} from "@/app/(app)/inventory/actions";
import { BarcodeScanner } from "./barcode-scanner";
import { cn } from "@/lib/utils";
import { quickAddsForLocation } from "@/lib/inventory/quick-adds";
import type { PantryLocation } from "@/lib/types/database";

type Mode = "manual" | "bulk" | "barcode" | "receipt";

const MODES: { id: Mode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "bulk", label: "Bulk paste" },
  { id: "barcode", label: "Barcode" },
  { id: "receipt", label: "Receipt" },
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
          <Label accent>add to inventory</Label>
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

  function save() {
    setError(null);
    const finalName = name.trim();
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
        setName("");
        onSaved();
      }
    });
  }

  // Quick-add presets carry their own smart unit/qty defaults; the location
  // sticks to whatever tab the user is on.
  function quickAdd(preset: { name: string; qty: number; unit: string }) {
    setError(null);
    start(async () => {
      const result = await addOrIncrementPantryItem({
        name: preset.name,
        qty: preset.qty,
        unit: preset.unit,
        location,
      });
      if (result?.error) setError(result.error);
      else onSaved();
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
        <Btn variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </Btn>
      </div>
      <QuickAddSection location={location} onQuickAdd={quickAdd} />
    </div>
  );
}

function QuickAddSection({
  location,
  onQuickAdd,
}: {
  location: PantryLocation;
  onQuickAdd: (preset: { name: string; qty: number; unit: string }) => void;
}) {
  const presets = quickAddsForLocation(location);
  return (
    <div className="border-t border-ink-l/40 pt-3">
      <div className="flex items-baseline justify-between">
        <Label>quick add</Label>
        <Mono className="text-ink-3 text-[10px]">→ {location}</Mono>
      </div>
      {presets.length === 0 ? (
        <Body size="xs" dim className="mt-2">
          No quick presets for {location} yet — type the item name above.
        </Body>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {presets.map((q) => (
            <Chip
              key={`${q.name}-${q.unit}`}
              variant="default"
              interactive
              onClick={() => onQuickAdd(q)}
              title={`Adds ${q.qty} ${q.unit} → ${location}`}
            >
              + {q.name}{" "}
              <span className="text-ink-3 ml-0.5">
                {q.qty} {q.unit}
              </span>
            </Chip>
          ))}
        </div>
      )}
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

// Canonical units the parsed grid offers in the dropdown. The AI parser
// occasionally invents oddballs ("doz", "head", "container") — those
// are kept as the row's current value and prepended to the option list
// so the user sees their item correctly while still being able to pick
// one of the canonical units instead.
const PARSED_UNIT_OPTIONS = [
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
  "tbsp",
  "tsp",
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
] as const;

const PARSED_LOCATION_OPTIONS = [
  { value: "pantry" as PantryLocation, label: "Pantry" },
  { value: "fridge" as PantryLocation, label: "Fridge" },
  { value: "freezer" as PantryLocation, label: "Freezer" },
  { value: "spices" as PantryLocation, label: "Spices" },
];

function unitOptionsFor(currentUnit: string) {
  const includes = (PARSED_UNIT_OPTIONS as readonly string[]).includes(currentUnit);
  const list = includes
    ? [...PARSED_UNIT_OPTIONS]
    : [currentUnit, ...PARSED_UNIT_OPTIONS];
  return list.map((u) => ({ value: u, label: u }));
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
          className="grid grid-cols-[minmax(0,2fr)_50px_70px_90px_24px] gap-2 px-3 py-2 border-b border-ink-l/40 last:border-b-0 items-center"
        >
          <input
            value={it.name}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, name: e.target.value };
              setItems(next);
            }}
            className="bg-transparent text-ink font-sans text-[13px] outline-none min-w-0"
          />
          <input
            value={it.qty}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, qty: Number(e.target.value) || 1 };
              setItems(next);
            }}
            inputMode="decimal"
            aria-label="Quantity"
            className="bg-transparent text-ink font-mono text-[13px] outline-none text-center min-w-0"
          />
          <Select<string>
            value={it.unit}
            onChange={(unit) => {
              const next = [...items];
              next[i] = { ...it, unit };
              setItems(next);
            }}
            options={unitOptionsFor(it.unit)}
            ariaLabel="Unit"
            align="left"
            fullWidth
            className="text-[12px] font-mono min-w-0"
          />
          <Select<PantryLocation>
            value={it.location}
            onChange={(location) => {
              const next = [...items];
              next[i] = { ...it, location };
              setItems(next);
            }}
            options={PARSED_LOCATION_OPTIONS}
            ariaLabel="Location"
            align="left"
            fullWidth
            className="text-[12px] min-w-0"
          />
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
  return (
    <BarcodeScanner
      onAdd={async (item) => {
        // Dedup by (name, unit, location). Two scans of the same jar
        // increment qty instead of creating a second row — fixes the
        // "I scanned milk 16 times because I didn't see any feedback"
        // pile-up the previous flow had.
        //
        // The product photo from OFF is only persisted on first add;
        // increments leave the existing photo alone (no point fetching
        // and re-saving the same URL).
        const result = await addOrIncrementPantryItem({
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          location: item.location,
          source: item.source,
          // Pass the OFF photo so the inserted row gets it. The server
          // action preserves any existing photo on the increment path.
          photo_url: item.photoUrl,
        });
        if (result?.error) {
          return { ok: false as const, error: result.error };
        }
        // Refresh the underlying /inventory page so the item appears
        // immediately if the user closes the modal next.
        onSaved();
        // Build a short readable summary for the success banner +
        // session list. "each" is implicit; other units stay loud.
        const qtyLabel =
          item.unit === "each"
            ? `${item.qty} ${item.name}`
            : `${item.qty} ${item.unit} ${item.name}`;
        return {
          ok: true as const,
          summary: `${qtyLabel} → ${item.location}`,
        };
      }}
    />
  );
}

// Pull text out of a digital-receipt PDF (Smith's, Whole Foods, Instacart,
// any "save as PDF" download). Dynamic import keeps the 300KB+ bundle out
// of every page visit — only loaded when the user actually picks a PDF.
//
// Worker config: pdfjs-dist v5 needs a separate worker file. Pointing
// at unpkg avoids having to bundle/serve the worker through Next, at
// the cost of a one-time fetch when the user uploads their first PDF.
// Acceptable for a personal-use app — the worker file is ~1MB and
// browser-cached after first use.
//
// Returns null if the PDF has no text layer (scanned PDFs / image-only),
// so the caller can give the user actionable advice ("save as image").
async function extractPdfText(file: File): Promise<string | null> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(text);
  }
  const joined = pages.join("\n").trim();
  // Heuristic: a scanned PDF either yields nothing or a few stray
  // characters from header garbage. Anything under 40 chars is almost
  // certainly missing the real receipt body.
  if (joined.length < 40) return null;
  return joined;
}

function ReceiptMode({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    setParsed(null);
    setPreviewUrl(null);
    setPdfFilename(null);

    try {
      const isImage = file.type.startsWith("image/");
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      if (!isImage && !isPdf) {
        throw new Error(
          `${file.type || "That file type"} isn't supported — upload an image (PNG/JPG) or PDF.`,
        );
      }

      if (isPdf) {
        // Digital receipts (Smith's PDF download, Whole Foods email
        // receipt → save as PDF, etc.) have a real text layer. Pull
        // it out and route through the bulk-paste parser — the same
        // endpoint that handles "paste anything" in Bulk Paste mode.
        // More accurate than vision OCR for clean digital text, and
        // costs ~10× fewer tokens.
        setPdfFilename(file.name);
        const text = await extractPdfText(file);
        if (!text) {
          throw new Error(
            "This PDF doesn't have a readable text layer — looks like a scanned image saved as PDF. Save the original as PNG/JPG instead, or take a photo of the receipt.",
          );
        }
        const res = await fetch("/api/ai/pantry-bulk-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setParsed(json.items);
        return;
      }

      // Image path: vision OCR via the dedicated endpoint.
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
      // Clear the file input so the user can re-pick the same file
      // after fixing an error (otherwise React doesn't fire onChange).
      if (inputRef.current) inputRef.current.value = "";
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
        accept="image/*,application/pdf"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />
      {/* Buttons are scoped to the current state. Pre-parse: Upload.
          During parse: disabled "Reading…". Post-parse: primary becomes
          "Add N items" (the obvious next action) + an explicit
          "Discard & upload another" outline button so the user knows
          picking a new file replaces the current parse.
          Previously a single "Another receipt" button sat next to "Add"
          with the same primary style — users couldn't tell which one
          actually saved the data. */}
      <div className="flex gap-2 flex-wrap">
        {parsed ? (
          <>
            <Btn variant="primary" onClick={save} disabled={pending}>
              {pending ? "Adding…" : `Add ${parsed.length} items`}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={pending || parsing}
            >
              Discard & upload another
            </Btn>
          </>
        ) : (
          <Btn
            variant="primary"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? "Reading…" : "Upload receipt"}
          </Btn>
        )}
      </div>
      {!parsed && !parsing ? (
        <Body size="xs" dim>
          Image (PNG/JPG) of a paper receipt, or a digital receipt saved as PDF.
        </Body>
      ) : null}
      {pdfFilename ? (
        <div className="rounded-card border border-ink-l bg-paper-2 px-3 py-2 flex items-center gap-2">
          <Body size="sm">📄</Body>
          <Body size="sm" className="truncate">{pdfFilename}</Body>
        </div>
      ) : null}
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
