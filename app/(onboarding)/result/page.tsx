import Link from "next/link";
import { redirect } from "next/navigation";
import { H, Body, Btn, Label, Mono, Bar } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";

export default async function ResultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "name, kcal_target, protein_target, carbs_target, fat_target, goal",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.kcal_target) {
    redirect("/onboard");
  }

  const { data: insight } = await supabase
    .from("insights")
    .select("body")
    .eq("user_id", user.id)
    .eq("kind", "blueprint")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proteinKcal = (profile.protein_target ?? 0) * 4;
  const carbsKcal = (profile.carbs_target ?? 0) * 4;
  const fatKcal = (profile.fat_target ?? 0) * 9;
  const totalKcal = proteinKcal + carbsKcal + fatKcal || 1;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full flex flex-col gap-10 items-center text-center">
        <Label>your daily target</Label>

        <div className="flex flex-col gap-2 items-center">
          <Mono className="text-ink text-[88px] leading-none font-medium tabular-nums">
            {profile.kcal_target?.toLocaleString()}
          </Mono>
          <Label>kcal · per day</Label>
        </div>

        <div className="w-full flex flex-col gap-3">
          <div className="h-3 rounded-full overflow-hidden flex border border-ink-l">
            <div
              style={{
                width: `${(proteinKcal / totalKcal) * 100}%`,
                background: "var(--color-accent)",
              }}
              title={`protein ${profile.protein_target} g`}
            />
            <div
              style={{
                width: `${(carbsKcal / totalKcal) * 100}%`,
                background: "var(--color-warm)",
              }}
              title={`carbs ${profile.carbs_target} g`}
            />
            <div
              style={{
                width: `${(fatKcal / totalKcal) * 100}%`,
                background: "var(--color-success)",
              }}
              title={`fat ${profile.fat_target} g`}
            />
          </div>
          <div className="flex justify-between font-mono text-[12px] text-ink-2">
            <span>
              protein <span className="text-ink">{profile.protein_target} g</span>
            </span>
            <span>
              carbs <span className="text-ink">{profile.carbs_target} g</span>
            </span>
            <span>
              fat <span className="text-ink">{profile.fat_target} g</span>
            </span>
          </div>
          <Bar value={1} height={1} fillClassName="bg-ink-l" trackClassName="bg-transparent" className="opacity-0" />
        </div>

        {insight?.body ? (
          <div className="text-left flex flex-col gap-4">
            {insight.body
              .split(/\n\n+/)
              .filter(Boolean)
              .map((para: string, i: number) => (
                <Body key={i} size="md">
                  {para}
                </Body>
              ))}
          </div>
        ) : (
          <Body size="md" dim>
            Hestia computed this from Mifflin–St Jeor with your activity
            multiplier. As your weight or routine changes, you can recompute
            from the Me tab.
          </Body>
        )}

        <Link href="/today">
          <Btn variant="primary" size="lg">
            let&apos;s go →
          </Btn>
        </Link>
      </div>
    </main>
  );
}
