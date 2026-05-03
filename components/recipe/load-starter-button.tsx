"use client";

import { useState, useTransition } from "react";
import { Btn, Body } from "@/components/ds";
import { loadStarterRecipes } from "@/app/(app)/recipes/seed-action";

export function LoadStarterButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <Btn
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await loadStarterRecipes();
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Loading…" : "Load 12 starter recipes"}
      </Btn>
      {error ? (
        <Body size="sm" className="text-danger">
          {error}
        </Body>
      ) : null}
    </div>
  );
}
