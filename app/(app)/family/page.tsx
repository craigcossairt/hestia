import Link from "next/link";
import { redirect } from "next/navigation";
import { H, Body, Label, Btn, Card } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { FamilyCard } from "@/components/family/family-card";
import { TonightBuilder } from "@/components/family/tonight-builder";
import type { FamilyMember } from "@/lib/family";

export default async function FamilyPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_json")
    .eq("id", user.id)
    .maybeSingle();
  const family =
    (profile?.family_json as FamilyMember[] | null | undefined) ?? [];

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>household</Label>
        <H size="xl" as="h1">
          Family
        </H>
        <Body size="lg" dim>
          Everyone you cook for. Hestia uses these to plan plates that work
          for the whole table.
        </Body>
      </header>

      {family.length === 0 ? (
        <Card className="p-8 flex flex-col items-center text-center gap-4 border-dashed">
          <Body dim>
            No family members yet. Add them on the Me tab to enable per-person
            portions, picky-eater pathways, and allergen checks.
          </Body>
          <Link href="/me">
            <Btn variant="primary">Add family on Me →</Btn>
          </Link>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {family.map((m) => (
              <FamilyCard key={m.id} member={m} />
            ))}
          </section>
          <section>
            <TonightBuilder />
          </section>
        </>
      )}
    </div>
  );
}
