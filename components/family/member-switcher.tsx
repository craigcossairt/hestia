"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { Select, type SelectOption } from "@/components/ds";

interface MemberSwitcherProps {
  // null = current selection is the user themself.
  selectedId: string | null;
  // {id, name} for each named family member.
  members: Array<{ id: string; name: string }>;
  // Override the URL search-param key (default "as").
  paramKey?: string;
}

// Page-level filter that lets the user view a different household member's
// data. Stored in the ?as= query param so it survives navigations and is
// shareable. "self" (or absent) means the account holder.
export function MemberSwitcher({
  selectedId,
  members,
  paramKey = "as",
}: MemberSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const options: SelectOption<string>[] = [
    { value: "self", label: "You" },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  const value = selectedId ?? "self";

  function setValue(next: string) {
    const params = new URLSearchParams(search?.toString());
    if (next === "self") params.delete(paramKey);
    else params.set(paramKey, next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-ink-l bg-card">
      <Users size={13} strokeWidth={1.6} className="text-ink-3" />
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        Viewing
      </span>
      <Select<string>
        value={value}
        onChange={setValue}
        options={options}
        align="left"
        ariaLabel="View as family member"
      />
    </div>
  );
}
