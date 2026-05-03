import Link from "next/link";
import Image from "next/image";
import { Body, Btn, Label } from "@/components/ds";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center flex flex-col gap-5 items-center">
        <Image
          src="/logos/full.png"
          alt="Hestia"
          width={565}
          height={565}
          priority
          className="h-40 w-auto"
        />
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
        <Label>welcome to the hearth</Label>
      </div>
    </main>
  );
}
