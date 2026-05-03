"use client";

import { useState, useTransition } from "react";
import { H, Body, Btn, Card, Chip } from "@/components/ds";
import { OptionCard } from "@/components/onboarding/option-card";
import { StepDots } from "@/components/onboarding/step-dots";
import { submitOnboarding, type OnboardSubmission } from "./actions";
import type { Activity, Goal, Sex } from "@/lib/types/database";
import { ftInToCm, lbToKg } from "@/lib/units";

const TOTAL_STEPS = 6;

const GOALS: { id: Goal; label: string; description: string }[] = [
  { id: "lose", label: "Lose weight", description: "Sustainable deficit, ~1 lb / week." },
  { id: "build", label: "Build muscle", description: "Modest surplus, high protein." },
  { id: "maintain", label: "Maintain", description: "Hold steady, eat consciously." },
  { id: "energy", label: "Improve energy", description: "Same kcal, smarter timing." },
];

const ACTIVITIES: { id: Activity; label: string; description: string }[] = [
  { id: "sedentary", label: "Sedentary", description: "Desk work, little exercise." },
  { id: "light", label: "Light", description: "1–3 light sessions / week." },
  { id: "moderate", label: "Moderate", description: "3–5 sessions / week." },
  { id: "active", label: "Active", description: "6–7 sessions / week." },
  { id: "very_active", label: "Very active", description: "Twice-daily training." },
];

const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "low-carb",
  "high-protein",
  "no pork",
  "no beef",
  "halal",
  "kosher",
];

interface FormState {
  name: string;
  goal: Goal | null;
  sex: Sex | null;
  age: number | "";
  height_ft: number | "";
  height_in: number | "";
  weight_lb: number | "";
  activity: Activity | null;
  dietary_restrictions: string[];
  schedule: { breakfast: string; lunch: string; dinner: string };
}

const initial: FormState = {
  name: "",
  goal: null,
  sex: null,
  age: "",
  height_ft: 5,
  height_in: 10,
  weight_lb: 165,
  activity: null,
  dietary_restrictions: [],
  schedule: { breakfast: "08:00", lunch: "12:30", dinner: "19:00" },
};

export default function OnboardPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return form.name.trim().length > 0 && !!form.goal;
      case 1:
        return !!form.sex && Number(form.age) >= 13;
      case 2:
        return (
          Number(form.height_ft) > 0 &&
          Number(form.height_in) >= 0 &&
          Number(form.weight_lb) > 0
        );
      case 3:
        return !!form.activity;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  })();

  const submit = () => {
    setError(null);
    if (
      !form.goal ||
      !form.sex ||
      !form.activity ||
      !form.age ||
      form.height_ft === "" ||
      form.height_in === "" ||
      !form.weight_lb
    ) {
      setError("Please complete every step.");
      return;
    }
    const payload: OnboardSubmission = {
      name: form.name.trim(),
      goal: form.goal,
      sex: form.sex,
      age: Number(form.age),
      height_cm: ftInToCm(Number(form.height_ft), Number(form.height_in)),
      weight_kg: lbToKg(Number(form.weight_lb)),
      activity: form.activity,
      dietary_restrictions: form.dietary_restrictions,
      schedule: form.schedule,
    };
    start(async () => {
      const result = await submitOnboarding(payload);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md p-8 flex flex-col gap-7">
        <StepDots total={TOTAL_STEPS} current={step} />

        {step === 0 && (
          <Step
            eyebrow="step 1 — your goal"
            title="What brings you to Hestia?"
          >
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Your first name"
              className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
            />
            <div className="flex flex-col gap-2">
              {GOALS.map((g) => (
                <OptionCard
                  key={g.id}
                  label={g.label}
                  description={g.description}
                  selected={form.goal === g.id}
                  onSelect={() => set("goal", g.id)}
                />
              ))}
            </div>
          </Step>
        )}

        {step === 1 && (
          <Step eyebrow="step 2 — biology" title="A few basics.">
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female", "other"] as const).map((s) => (
                <OptionCard
                  key={s}
                  label={s[0].toUpperCase() + s.slice(1)}
                  selected={form.sex === s}
                  onSelect={() => set("sex", s)}
                />
              ))}
            </div>
            <NumberField
              label="age"
              value={form.age}
              onChange={(v) => set("age", v)}
              min={13}
              max={100}
              suffix="yrs"
            />
          </Step>
        )}

        {step === 2 && (
          <Step eyebrow="step 3 — body" title="Your starting point.">
            <HeightField
              ft={form.height_ft}
              inches={form.height_in}
              onChange={(ft, inches) => {
                set("height_ft", ft);
                set("height_in", inches);
              }}
            />
            <NumberField
              label="weight"
              value={form.weight_lb}
              onChange={(v) => set("weight_lb", v)}
              min={60}
              max={550}
              suffix="lb"
            />
          </Step>
        )}

        {step === 3 && (
          <Step eyebrow="step 4 — activity" title="A typical week of movement?">
            <div className="flex flex-col gap-2">
              {ACTIVITIES.map((a) => (
                <OptionCard
                  key={a.id}
                  label={a.label}
                  description={a.description}
                  selected={form.activity === a.id}
                  onSelect={() => set("activity", a.id)}
                />
              ))}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step
            eyebrow="step 5 — preferences"
            title="Anything Hestia should plan around?"
          >
            <Body size="sm" dim>
              Tap any that apply. Skip if none do.
            </Body>
            <div className="flex flex-wrap gap-2">
              {DIET_TAGS.map((tag) => {
                const on = form.dietary_restrictions.includes(tag);
                return (
                  <Chip
                    key={tag}
                    variant={on ? "fill" : "default"}
                    interactive
                    onClick={() =>
                      set(
                        "dietary_restrictions",
                        on
                          ? form.dietary_restrictions.filter((t) => t !== tag)
                          : [...form.dietary_restrictions, tag],
                      )
                    }
                  >
                    {tag}
                  </Chip>
                );
              })}
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step eyebrow="step 6 — schedule" title="When do you usually eat?">
            <TimeField
              label="breakfast"
              value={form.schedule.breakfast}
              onChange={(v) => set("schedule", { ...form.schedule, breakfast: v })}
            />
            <TimeField
              label="lunch"
              value={form.schedule.lunch}
              onChange={(v) => set("schedule", { ...form.schedule, lunch: v })}
            />
            <TimeField
              label="dinner"
              value={form.schedule.dinner}
              onChange={(v) => set("schedule", { ...form.schedule, dinner: v })}
            />
          </Step>
        )}

        {error ? (
          <Body size="sm" className="text-danger">
            {error}
          </Body>
        ) : null}

        <div className="flex justify-between items-center">
          <Btn
            variant="ghost"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || pending}
          >
            ← back
          </Btn>
          {step < TOTAL_STEPS - 1 ? (
            <Btn
              variant="primary"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance}
            >
              next →
            </Btn>
          ) : (
            <Btn variant="primary" onClick={submit} disabled={!canAdvance || pending}>
              {pending ? "computing…" : "see my target →"}
            </Btn>
          )}
        </div>
      </Card>
    </main>
  );
}

function Step({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10.5px] tracking-[1.4px] uppercase font-medium text-ink-3">
          {eyebrow}
        </div>
        <H size="md" as="h1">
          {title}
        </H>
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-thumb border border-ink-l bg-card focus-within:border-accent transition-colors">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v));
          }}
          className="bg-transparent text-ink font-mono text-[18px] outline-none w-24 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix ? (
          <span className="font-mono text-[12px] text-ink-3">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function HeightField({
  ft,
  inches,
  onChange,
}: {
  ft: number | "";
  inches: number | "";
  onChange: (ft: number | "", inches: number | "") => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-thumb border border-ink-l bg-card focus-within:border-accent transition-colors">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
        height
      </span>
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={3}
          max={8}
          value={ft}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v), inches);
          }}
          className="bg-transparent text-ink font-mono text-[18px] outline-none w-10 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="font-mono text-[12px] text-ink-3">ft</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={11}
          value={inches}
          onChange={(e) => {
            const v = e.target.value;
            onChange(ft, v === "" ? "" : Number(v));
          }}
          className="bg-transparent text-ink font-mono text-[18px] outline-none w-10 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="font-mono text-[12px] text-ink-3">in</span>
      </div>
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-thumb border border-ink-l bg-card focus-within:border-accent transition-colors">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-ink font-mono text-[18px] outline-none w-28 text-right"
      />
    </label>
  );
}
