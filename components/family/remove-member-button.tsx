"use client";

import { useState, useTransition } from "react";
import { Btn } from "@/components/ds";
import { removeMember } from "@/app/(app)/family/[id]/actions";

interface RemoveMemberButtonProps {
  memberId: string;
  memberName: string;
}

export function RemoveMemberButton({
  memberId,
  memberName,
}: RemoveMemberButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function trigger() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    start(async () => {
      const result = await removeMember(memberId);
      if (result?.error) setError(result.error);
      // Success path redirects server-side, so we never get here.
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Btn
        variant="outline"
        size="sm"
        onClick={trigger}
        disabled={pending}
        className={confirming ? "border-danger text-danger hover:bg-danger/10" : ""}
      >
        {pending
          ? "Removing…"
          : confirming
            ? `Confirm — remove ${memberName || "member"}`
            : "Remove member"}
      </Btn>
      {confirming && !pending ? (
        <Btn variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Btn>
      ) : null}
      {error ? (
        <span className="text-danger font-sans text-[12px]">{error}</span>
      ) : null}
    </div>
  );
}
