"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Btn } from "@/components/ds";

// Refresh button for /shop. Two modes:
//
//  - Default ("Refresh"): re-renders the server component to pick up
//    fresh meal plan, pantry, and override state. Quantity changes
//    propagate within the page's normal revalidation, but a user
//    finishing edits in another tab won't see them until this
//    button (or any other server-action-driven refresh) fires.
//  - Force prices ("withPrices"): navigates with ?fresh=<timestamp>,
//    which signals the server component to call Kroger with
//    bypassCache=true. The query string changes on every click so
//    Next.js doesn't dedupe to the same RSC payload.
//
// Both modes use useTransition so the button stays clickable but
// shows a pending state — server-component renders aren't instant
// when Kroger is in the loop.
interface ShopRefreshProps {
  // True when the user has a Kroger location set. Disables the
  // "with prices" path otherwise (no point hitting an empty cache).
  withPrices: boolean;
}

export function ShopRefresh({ withPrices }: ShopRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh(forcePrices: boolean) {
    startTransition(() => {
      if (forcePrices && withPrices) {
        router.push(`/shop?fresh=${Date.now()}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Btn
        variant="ghost"
        size="sm"
        onClick={() => refresh(false)}
        disabled={isPending}
        aria-label="Refresh shop list"
      >
        <RefreshCw
          size={12}
          strokeWidth={2}
          className={isPending ? "animate-spin" : undefined}
        />
        <span className="ml-1.5">{isPending ? "refreshing…" : "refresh"}</span>
      </Btn>
      {withPrices ? (
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={isPending}
          className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3 hover:text-ink transition-colors disabled:opacity-50"
        >
          force-refresh prices
        </button>
      ) : null}
    </div>
  );
}
