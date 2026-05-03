import { redirect } from "next/navigation";
import { H, Body, Label } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { CoachChat } from "@/components/coach/chat";

export default async function CoachPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Label>chat</Label>
        <H size="xl" as="h1">
          Coach
        </H>
        <Body size="lg" dim>
          A calm, evidence-based thinking partner that knows your targets,
          recent meals, and inventory.
        </Body>
      </header>

      <CoachChat />
    </div>
  );
}
