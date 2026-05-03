"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Btn } from "@/components/ds";
import { addMember } from "@/app/(app)/family/[id]/actions";

export function AddMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const result = await addMember(name);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setName("");
      setOpen(false);
      if (result?.id) router.push(`/family/${result.id}`);
    });
  }

  if (!open) {
    return (
      <Btn variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} strokeWidth={2} />
        Add household member
      </Btn>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Member name"
        className="flex-1 px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      <Btn variant="primary" size="sm" onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Btn>
      <Btn
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
      >
        Cancel
      </Btn>
      {error ? (
        <span className="text-danger font-sans text-[12px]">{error}</span>
      ) : null}
    </div>
  );
}
