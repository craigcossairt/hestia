"use client";

import { useState, useTransition } from "react";
import { Card, Label, Body, Btn, Mono, Select } from "@/components/ds";
import { updateProfile, recomputeTargets } from "@/app/(app)/me/actions";
import {
  updateMember,
  recomputeMemberTargets,
} from "@/app/(app)/family/[id]/actions";
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from "@/lib/units";
import type { Activity, Goal, Sex } from "@/lib/types/database";

export type EditScope = { kind: "user" } | { kind: "member"; memberId: string };

interface ProfileSectionProps {
  scope?: EditScope;
  profile: {
    name: string | null;
    sex: Sex | null;
    age: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    activity: Activity | null;
    goal: Goal | null;
    kcal_target: number | null;
    protein_target: number | null;
    carbs_target: number | null;
    fat_target: number | null;
  };
}

const ACTIVITIES: Activity[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS: Goal[] = ["lose", "maintain", "build", "energy"];

export function ProfileSection({
  profile,
  scope = { kind: "user" },
}: ProfileSectionProps) {
  const ft = profile.height_cm ? cmToFtIn(profile.height_cm).ft : 5;
  const inches = profile.height_cm ? cmToFtIn(profile.height_cm).in : 10;
  const lb = profile.weight_kg ? kgToLb(profile.weight_kg) : 165;

  const [name, setName] = useState(profile.name ?? "");
  const [sex, setSex] = useState<Sex>(profile.sex ?? "male");
  const [age, setAge] = useState<number>(profile.age ?? 30);
  const [heightFt, setHeightFt] = useState<number>(ft);
  const [heightIn, setHeightIn] = useState<number>(inches);
  const [weightLb, setWeightLb] = useState<number>(lb);
  const [activity, setActivity] = useState<Activity>(profile.activity ?? "moderate");
  const [goal, setGoal] = useState<Goal>(profile.goal ?? "maintain");

  const [pending, start] = useTransition();
  const [recomputing, startRecompute] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    setStatus(null);
    start(async () => {
      const patch = {
        name: name.trim(),
        sex,
        age,
        height_cm: ftInToCm(heightFt, heightIn),
        weight_kg: lbToKg(weightLb),
        activity,
        goal,
      };
      const result =
        scope.kind === "user"
          ? await updateProfile(patch)
          : await updateMember(scope.memberId, patch);
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
    });
  }

  function recompute() {
    setStatus(null);
    startRecompute(async () => {
      const result =
        scope.kind === "user"
          ? await recomputeTargets()
          : await recomputeMemberTargets(scope.memberId);
      if (result?.error) setStatus(`Error: ${result.error}`);
      else setStatus("Targets recomputed.");
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Label accent>profile</Label>
        {status ? (
          <Body size="xs" className={status.startsWith("Error") ? "text-danger" : "text-success"}>
            {status}
          </Body>
        ) : null}
      </div>

      <Field label="name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-transparent text-ink font-sans text-[14px] outline-none w-full text-right"
        />
      </Field>

      <Field label="sex">
        <Select<Sex>
          value={sex}
          onChange={setSex}
          ariaLabel="sex"
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>

      <Field label="age">
        <NumberInput value={age} onChange={setAge} suffix="yrs" />
      </Field>

      <Field label="height">
        <div className="flex items-baseline gap-1">
          <NumberInput value={heightFt} onChange={setHeightFt} suffix="ft" width="w-10" />
          <NumberInput value={heightIn} onChange={setHeightIn} suffix="in" width="w-10" />
        </div>
      </Field>

      <Field label="weight">
        <NumberInput value={weightLb} onChange={setWeightLb} suffix="lb" />
      </Field>

      <Field label="activity">
        <Select<Activity>
          value={activity}
          onChange={setActivity}
          ariaLabel="activity"
          options={ACTIVITIES.map((a) => ({
            value: a,
            label: a.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          }))}
        />
      </Field>

      <Field label="goal">
        <Select<Goal>
          value={goal}
          onChange={setGoal}
          ariaLabel="goal"
          options={GOALS.map((g) => ({
            value: g,
            label: g.replace(/\b\w/g, (c) => c.toUpperCase()),
          }))}
        />
      </Field>

      <div className="border-t border-ink-l/50 pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>current targets</Label>
          <Mono className="text-ink-3 text-[11px]">computed</Mono>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TargetTile label="kcal" value={profile.kcal_target ?? "—"} />
          <TargetTile label="protein" value={profile.protein_target != null ? `${profile.protein_target}g` : "—"} />
          <TargetTile label="carbs" value={profile.carbs_target != null ? `${profile.carbs_target}g` : "—"} />
          <TargetTile label="fat" value={profile.fat_target != null ? `${profile.fat_target}g` : "—"} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Btn>
        <Btn variant="outline" onClick={recompute} disabled={recomputing}>
          {recomputing ? "Recomputing…" : "Recompute targets"}
        </Btn>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2 -mx-1 rounded-thumb hover:bg-paper-2 transition-colors">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  width = "w-20",
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  width?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`bg-transparent text-ink font-mono text-[16px] outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${width}`}
      />
      {suffix ? (
        <span className="font-mono text-[11px] text-ink-3">{suffix}</span>
      ) : null}
    </div>
  );
}

function TargetTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-thumb bg-paper-2/60">
      <Label>{label}</Label>
      <Mono className="text-ink text-[18px] font-medium">{value}</Mono>
    </div>
  );
}
