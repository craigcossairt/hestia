"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  assignableToMembers,
  findConflict,
  getProgram,
} from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";
import {
  buildPlanStaleHint,
  setPlanStaleHintCookie,
} from "@/lib/plans/staleness";

// Build a "{Program} was {verb} {scope}" reason string for the
// plan-staleness prompt. Stays concise so it fits in the dialog body
// and reads naturally as the seed text in the /plan refine modal.
function programStaleReason(args: {
  programName: string;
  verb: "activated" | "deactivated";
  scope: Scope;
  family: FamilyMember[];
}): string {
  // Destructure so TypeScript narrows the discriminated union — bare
  // `args.scope.kind` checks don't always carry the narrowing into
  // subsequent accesses.
  const { scope } = args;
  if (scope.kind === "user") {
    return `${args.programName} was ${args.verb} for you`;
  }
  const member = args.family.find((m) => m.id === scope.memberId);
  const who = member?.name ?? "a household member";
  return `${args.programName} was ${args.verb} for ${who}`;
}

// Where the program is being applied. User-scope = the account holder
// (lives in profiles.active_programs). Member-scope = a single household
// member (lives in that member's entry inside profiles.family_json).
export type Scope =
  | { kind: "user" }
  | { kind: "member"; memberId: string };

interface MutationResult {
  ok?: boolean;
  error?: string;
  replaced?: { id: string; name: string; scope: Scope };
}

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

interface ProfileRow {
  active_programs: string[] | null;
  family_json: FamilyMember[] | null;
}

async function loadProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ProfileRow> {
  const { data } = await supabase
    .from("profiles")
    .select("active_programs, family_json")
    .eq("id", userId)
    .maybeSingle();
  const row = data as ProfileRow | null;
  return {
    active_programs: row?.active_programs ?? [],
    family_json: row?.family_json ?? [],
  };
}

export async function activateProgram(
  programId: string,
  scope: Scope = { kind: "user" },
): Promise<MutationResult> {
  const program = getProgram(programId);
  if (!program) return { error: "Unknown program." };

  if (scope.kind === "member" && !assignableToMembers(program.kind)) {
    return {
      error: `${program.name} is a household program — assign it to yourself.`,
    };
  }

  const { supabase, user } = await getUserOrRedirect();
  const profile = await loadProfile(supabase, user.id);

  let replaced: MutationResult["replaced"];

  if (scope.kind === "user") {
    const current = profile.active_programs ?? [];
    if (current.includes(programId)) {
      return { ok: true };
    }
    const conflict = findConflict(programId, current);
    const next = current
      .filter((id) => id !== conflict?.replacedId)
      .concat(programId);
    if (conflict) {
      replaced = {
        id: conflict.replacedId,
        name: conflict.replacedName,
        scope: { kind: "user" },
      };
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        active_programs: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) return { error: error.message };
  } else {
    const family = profile.family_json ?? [];
    const memberIdx = family.findIndex((m) => m.id === scope.memberId);
    if (memberIdx === -1) return { error: "Family member not found." };
    const member = family[memberIdx];
    const current = member.active_programs ?? [];
    if (current.includes(programId)) {
      return { ok: true };
    }
    const conflict = findConflict(programId, current);
    const nextPrograms = current
      .filter((id) => id !== conflict?.replacedId)
      .concat(programId);
    if (conflict) {
      replaced = {
        id: conflict.replacedId,
        name: conflict.replacedName,
        scope: { kind: "member", memberId: scope.memberId },
      };
    }
    const updatedFamily = family.map((m, i) =>
      i === memberIdx ? { ...m, active_programs: nextPrograms } : m,
    );
    const { error } = await supabase
      .from("profiles")
      .update({
        family_json: updatedFamily,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) return { error: error.message };
  }

  // Drop a plan-staleness hint so the next page render asks the user
  // whether to refresh upcoming plans against the new program context.
  // The hint short-circuits when there are no upcoming planned entries.
  // Self-scope changes also offer to recompute the user's targets —
  // programs like Workout Fuel or Therapeutic genuinely shift macro
  // budgets even though the underlying Mifflin-St Jeor inputs haven't
  // moved. Member-scope skips the recompute offer because member
  // targets live on a different code path.
  const hint = await buildPlanStaleHint(
    supabase,
    user.id,
    programStaleReason({
      programName: program.name,
      verb: "activated",
      scope,
      family: profile.family_json ?? [],
    }),
    { offerTargetRecompute: scope.kind === "user" },
  );
  await setPlanStaleHintCookie(hint);

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/today");
  revalidatePath("/family");
  revalidatePath("/me");
  revalidatePath("/coach");
  return { ok: true, replaced };
}

export async function deactivateProgram(
  programId: string,
  scope: Scope = { kind: "user" },
): Promise<MutationResult> {
  const program = getProgram(programId);
  const { supabase, user } = await getUserOrRedirect();
  const profile = await loadProfile(supabase, user.id);

  if (scope.kind === "user") {
    const current = profile.active_programs ?? [];
    const next = current.filter((id) => id !== programId);
    if (next.length === current.length) return { ok: true };
    const { error } = await supabase
      .from("profiles")
      .update({
        active_programs: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) return { error: error.message };
  } else {
    const family = profile.family_json ?? [];
    const memberIdx = family.findIndex((m) => m.id === scope.memberId);
    if (memberIdx === -1) return { error: "Family member not found." };
    const updatedFamily = family.map((m, i) =>
      i === memberIdx
        ? {
            ...m,
            active_programs: (m.active_programs ?? []).filter(
              (id) => id !== programId,
            ),
          }
        : m,
    );
    const { error } = await supabase
      .from("profiles")
      .update({
        family_json: updatedFamily,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) return { error: error.message };
  }

  // Same plan-staleness hint as activate. Use the program name when
  // we can resolve it; fall back to "A program" if the registry lookup
  // returned undefined (legacy IDs from older plans).
  const hint = await buildPlanStaleHint(
    supabase,
    user.id,
    programStaleReason({
      programName: program?.name ?? "A program",
      verb: "deactivated",
      scope,
      family: profile.family_json ?? [],
    }),
    { offerTargetRecompute: scope.kind === "user" },
  );
  await setPlanStaleHintCookie(hint);

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/today");
  revalidatePath("/family");
  revalidatePath("/me");
  revalidatePath("/coach");
  return { ok: true };
}
