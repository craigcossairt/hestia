"use client";

import { useActionState } from "react";
import { Btn, Body, H, Label, Card } from "@/components/ds";
import { sendMagicLink } from "./actions";

type State = { sent?: boolean; email?: string; error?: string } | null;

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    sendMagicLink,
    null,
  );

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2 items-center text-center">
          <Label>welcome to</Label>
          <H size="xl" as="h1">
            Hestia
          </H>
          <Body dim>Sign in with a magic link — no password needed.</Body>
        </div>

        {state?.sent ? (
          <div className="flex flex-col gap-3 items-center text-center">
            <Label accent>check your inbox</Label>
            <Body>
              We sent a sign-in link to <span className="text-ink">{state.email}</span>.
            </Body>
            <Body size="sm" dim>
              Click the link to come back here, signed in.
            </Body>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent transition-colors"
            />
            {state?.error ? (
              <Body size="sm" className="text-danger">
                {state.error}
              </Body>
            ) : null}
            <Btn variant="primary" type="submit" disabled={pending} full>
              {pending ? "sending…" : "send magic link"}
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
