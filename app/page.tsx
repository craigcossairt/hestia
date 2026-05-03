import Link from "next/link";
import { H, Body, Btn, Label } from "@/components/ds";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center flex flex-col gap-6 items-center">
        <Label>welcome</Label>
        <H size="xl" as="h1">
          Hestia
        </H>
        <Body size="lg">
          A calm meal planner that pairs daily nutrition targets with an AI
          coach, an inventory-aware grocery list, and recipe + cook flows.
        </Body>
        <div className="flex gap-3 mt-2">
          <Link href="/today">
            <Btn variant="primary">Open app →</Btn>
          </Link>
          <Link href="/dev/ds">
            <Btn variant="outline">Design system</Btn>
          </Link>
        </div>
      </div>
    </main>
  );
}
