"use client";

import { useState, useTransition } from "react";
import { Receipt, X } from "lucide-react";
import { Btn, Body, Label, Mono } from "@/components/ds";
import {
  logGroceryPurchase,
  removeGroceryPurchase,
} from "@/app/(app)/shop/actions";

interface PurchaseRow {
  id: string;
  amount_cents: number;
  note: string | null;
  purchased_at: string;
}

interface LogPurchaseFormProps {
  recent: PurchaseRow[];
  weekTotalCents: number;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function LogPurchaseForm({
  recent,
  weekTotalCents,
}: LogPurchaseFormProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const n = Number(amount);
    if (!n || n <= 0) {
      setError("Enter an amount.");
      return;
    }
    start(async () => {
      const result = await logGroceryPurchase({
        amountDollars: n,
        note: note.trim() || undefined,
      });
      if (result?.error) setError(result.error);
      else {
        setAmount("");
        setNote("");
      }
    });
  }

  return (
    <div className="rounded-card border border-ink-l bg-card p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <Label accent>spend log</Label>
        <Mono className="text-ink-3 text-[11px]">
          this week · <span className="text-ink">{dollars(weekTotalCents)}</span>
        </Mono>
      </div>
      <Body size="sm" dim>
        Log each grocery trip&apos;s total. Hestia uses it on Stats to show
        your weekly spend without having to itemize anything.
      </Body>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            amount
          </span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-ink-3 text-[14px]">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="0.00"
              className="w-24 px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[8rem]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Trader Joe's, Costco run, etc."
            className="px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent"
          />
        </label>
        <Btn variant="primary" size="sm" onClick={submit} disabled={pending}>
          <Receipt size={13} strokeWidth={1.6} />
          {pending ? "Logging…" : "Log trip"}
        </Btn>
      </div>
      {error ? (
        <Body size="sm" className="text-danger">
          {error}
        </Body>
      ) : null}
      {recent.length > 0 ? (
        <ul className="flex flex-col border-t border-ink-l/40 pt-3 -mb-1">
          {recent.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <Mono className="text-ink text-[13px]">
                  {dollars(p.amount_cents)}
                </Mono>
                {p.note ? (
                  <Body size="xs" dim className="truncate">
                    {p.note}
                  </Body>
                ) : null}
              </div>
              <span className="text-ink-3 font-sans text-[11px] shrink-0">
                {DATE_FMT.format(new Date(p.purchased_at))}
              </span>
              <RemoveButton id={p.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RemoveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removeGroceryPurchase(id);
        })
      }
      aria-label="remove purchase"
      className="text-ink-3 hover:text-danger transition-colors p-1"
    >
      <X size={12} strokeWidth={1.8} />
    </button>
  );
}
