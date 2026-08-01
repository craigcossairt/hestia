import type { Step } from "@/lib/types/database";

/** Client-only key so React list state stays attached across add/remove/reorder. */
export type EditableStep = Step & { clientKey: string };

export function newEditableStep(
  partial: Partial<Step> = {},
): EditableStep {
  return {
    text: "",
    ...partial,
    clientKey: crypto.randomUUID(),
  };
}

export function toEditableSteps(steps: Step[]): EditableStep[] {
  return steps.map((step) =>
    "clientKey" in step &&
    typeof (step as EditableStep).clientKey === "string" &&
    (step as EditableStep).clientKey
      ? (step as EditableStep)
      : newEditableStep(step),
  );
}
