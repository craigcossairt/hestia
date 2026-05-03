import { H, Body, Label } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { PantryTabs } from "@/components/pantry/pantry-tabs";
import { PantryItemCard } from "@/components/pantry/pantry-item-card";
import { AddPantryFab } from "@/components/pantry/add-pantry-fab";
import type { PantryLocation } from "@/lib/types/database";

const VALID_LOCATIONS: PantryLocation[] = ["pantry", "fridge", "freezer", "spices"];

interface PageProps {
  searchParams: Promise<{ loc?: string }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { loc: rawLoc } = await searchParams;
  const loc = (
    VALID_LOCATIONS.includes(rawLoc as PantryLocation) ? rawLoc : "pantry"
  ) as PantryLocation;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    expires_at: string | null;
    photo_url: string | null;
  }> = [];
  if (user) {
    const { data } = await supabase
      .from("pantry_items")
      .select("id, name, qty, unit, expires_at, photo_url")
      .eq("user_id", user.id)
      .eq("location", loc)
      .order("added_at", { ascending: false });
    items = data ?? [];
  }

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-6 relative">
      <header className="flex flex-col gap-2">
        <Label>kitchen</Label>
        <H size="xl" as="h1">
          Inventory
        </H>
        <Body size="lg" dim>
          {items.length} {items.length === 1 ? "item" : "items"} in {loc}.
        </Body>
      </header>

      <PantryTabs />

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-l p-10 text-center">
          <Body dim>
            Nothing here yet. Tap + to add manually, paste a list, scan a
            barcode, or upload a receipt.
          </Body>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) => (
            <PantryItemCard
              key={it.id}
              id={it.id}
              name={it.name}
              qty={it.qty}
              unit={it.unit}
              expiresAt={it.expires_at}
              photoUrl={it.photo_url}
            />
          ))}
        </div>
      )}

      <AddPantryFab defaultLocation={loc} />
    </div>
  );
}
