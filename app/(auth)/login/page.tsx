"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Btn, Body, Card } from "@/components/ds";
import { sendOtp, verifyOtp } from "./actions";

type State =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string }
  | null;

export default function LoginPage() {
  const [emailState, sendAction, sending] = useActionState<State, FormData>(
    sendOtp,
    null,
  );
  const [codeState, verifyAction, verifying] = useActionState<State, FormData>(
    verifyOtp,
    null,
  );

  // Once we've successfully sent a code, switch to the verify step.
  // codeState wins if user is already attempting verification.
  const state: State =
    codeState && codeState.step === "code"
      ? codeState
      : emailState && emailState.step === "code"
        ? emailState
        : emailState;

  const onCodeStep = state?.step === "code";

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-3 items-center text-center">
          <Image
            src="/logos/full.png"
            alt="Hestia"
            width={565}
            height={565}
            priority
            className="h-28 w-auto"
          />
          <Body dim>
            {onCodeStep
              ? `We sent a code to ${state.email}.`
              : "A calm meal planner. Sign in with a one-time code."}
          </Body>
        </div>

        {onCodeStep ? (
          <form action={verifyAction} className="flex flex-col gap-3">
            <input type="hidden" name="email" value={state.email} />
            <input
              type="text"
              name="token"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              placeholder="Paste your code"
              className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[20px] tracking-[0.3em] text-center outline-none focus:border-accent transition-colors"
              autoFocus
            />
            {state.error ? (
              <Body size="sm" className="text-danger">
                {state.error}
              </Body>
            ) : null}
            <Btn variant="primary" type="submit" disabled={verifying} full>
              {verifying ? "Verifying…" : "Sign in"}
            </Btn>
            <Body size="xs" dim className="text-center">
              Wrong email?{" "}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="underline hover:text-ink"
              >
                Start over
              </button>
            </Body>
          </form>
        ) : (
          <form action={sendAction} className="flex flex-col gap-3">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent transition-colors"
              autoFocus
            />
            {state?.error ? (
              <Body size="sm" className="text-danger">
                {state.error}
              </Body>
            ) : null}
            <Btn variant="primary" type="submit" disabled={sending} full>
              {sending ? "Sending…" : "Send code"}
            </Btn>
          </form>
        )}

        <Body size="xs" dim className="text-center">
          By signing in, you agree to be a calm and curious eater.
        </Body>
      </Card>
    </main>
  );
}
