"use client";

import { useEffect, useState } from "react";

function computeGreetingWord(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface GreetingProps {
  name: string;
}

// Time-of-day greeting computed in the user's local timezone.
//
// /today is a server component, but Vercel server functions run in UTC
// — so a 2pm user in MST sees "Good evening" because UTC is ~9pm at
// that moment. Defer the computation to the browser via useEffect so
// the greeting reflects what's actually on the user's clock.
//
// To avoid hydration mismatch + a jarring flash from "evening → morning",
// the SSR and first client render show a generic "Hi, {name}." (the leading
// word is the only thing that varies). The actual greeting fills in on
// mount, which on a real device is fast enough to be unnoticeable.
//
// Refreshes every minute so a long-open page doesn't get stuck on
// "morning" all afternoon.
export function Greeting({ name }: GreetingProps) {
  const [word, setWord] = useState<string | null>(null);

  useEffect(() => {
    // Fire immediately + every minute. Setting state synchronously
    // here is intentional — the local time isn't available during
    // SSR or initial render, so we *must* update on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWord(computeGreetingWord(new Date()));
    const id = window.setInterval(
      () => setWord(computeGreetingWord(new Date())),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);

  if (!word) return <>Hi, {name}.</>;
  return (
    <>
      {word}, {name}.
    </>
  );
}
