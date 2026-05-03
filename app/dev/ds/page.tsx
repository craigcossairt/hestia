import {
  H,
  Body,
  Label,
  Mono,
  Card,
  Btn,
  Chip,
  Icon,
  Stat,
  Bar,
  Ring,
  FoodImage,
} from "@/components/ds";

export default function DesignSystemPage() {
  return (
    <main className="max-w-5xl mx-auto px-8 py-16 flex flex-col gap-16">
      <header className="flex flex-col gap-3">
        <Label>internal · design system</Label>
        <H size="xl" as="h1">
          Hestia primitives
        </H>
        <Body size="lg" dim>
          Visual smoke test for the warm-editorial token set.
        </Body>
      </header>

      {/* Type */}
      <section className="flex flex-col gap-4">
        <Label>typography</Label>
        <H size="xl">Display xl — Fraunces</H>
        <H size="lg">Display lg — Fraunces</H>
        <H size="md">Display md — Fraunces</H>
        <H size="sm">Display sm — Fraunces</H>
        <Body size="lg">Body lg — Inter, calm and generous.</Body>
        <Body size="md">Body md — Inter, the workhorse.</Body>
        <Body size="sm">Body sm — Inter, captions and meta.</Body>
        <Body size="xs">Body xs — Inter, the smallest legible step.</Body>
        <Mono className="text-ink">1,420 / 2,140 kcal · 86 g protein</Mono>
      </section>

      {/* Buttons */}
      <section className="flex flex-col gap-4">
        <Label>buttons</Label>
        <div className="flex flex-wrap gap-3 items-center">
          <Btn variant="primary">Start cooking →</Btn>
          <Btn variant="outline">Tell me more</Btn>
          <Btn variant="ghost">Dismiss</Btn>
          <Btn variant="primary" size="sm">
            Small primary
          </Btn>
          <Btn variant="outline" size="sm">
            Small outline
          </Btn>
          <Btn variant="primary" disabled>
            Disabled
          </Btn>
        </div>
      </section>

      {/* Chips */}
      <section className="flex flex-col gap-4">
        <Label>chips</Label>
        <div className="flex flex-wrap gap-2">
          <Chip>under 30 min</Chip>
          <Chip variant="accent">high protein</Chip>
          <Chip variant="fill">selected</Chip>
          <Chip variant="success">fresh</Chip>
          <Chip variant="warn">use soon</Chip>
          <Chip variant="danger">expired</Chip>
          <Chip variant="dim">low stock</Chip>
        </div>
      </section>

      {/* Cards */}
      <section className="flex flex-col gap-4">
        <Label>cards</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 flex flex-col gap-2">
            <Label>breakfast · 8:15</Label>
            <H size="sm">Greek yogurt + walnuts</H>
            <Mono className="text-ink-2 text-[13px]">
              420 kcal · 28 g protein
            </Mono>
          </Card>
          <Card accent className="p-4 flex flex-col gap-2">
            <Label accent>hestia spotted</Label>
            <Body size="sm">
              Your dinner protein is light tonight. Want a quick swap?
            </Body>
          </Card>
          <Card interactive className="p-4 flex flex-col gap-2">
            <Label>interactive</Label>
            <Body size="sm">Hover me — shadow lifts.</Body>
          </Card>
        </div>
      </section>

      {/* Ring + Bar */}
      <section className="flex flex-col gap-4">
        <Label>progress</Label>
        <div className="flex items-center gap-12 flex-wrap">
          <Ring value={0.66} size={200} stroke={10} label="1,420" sub="of 2,140 kcal" />
          <div className="flex flex-col gap-3 flex-1 min-w-[260px]">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <Label>protein</Label>
                <Mono className="text-ink-2 text-[12px]">86 / 140 g</Mono>
              </div>
              <Bar value={86 / 140} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <Label>carbs</Label>
                <Mono className="text-ink-2 text-[12px]">142 / 220 g</Mono>
              </div>
              <Bar value={142 / 220} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <Label>fat</Label>
                <Mono className="text-ink-2 text-[12px]">38 / 70 g</Mono>
              </div>
              <Bar value={38 / 70} />
            </div>
          </div>
        </div>
      </section>

      {/* Stat tiles */}
      <section className="flex flex-col gap-4">
        <Label>stats</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="avg kcal" value="2,082" sub="this week" />
          <Stat label="prep hours" value="3.2" sub="planned" />
          <Stat label="grocery" value="$84" sub="of $120" />
          <Stat label="streak" value="14" sub="days" />
        </div>
      </section>

      {/* FoodImage + Icons */}
      <section className="flex flex-col gap-4">
        <Label>food images</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FoodImage name="oatmeal" />
          <FoodImage name="salmon" />
          <FoodImage name="grain bowl" />
          <FoodImage name="roast chicken" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Label>icons</Label>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-4 text-ink">
          {(
            [
              "home",
              "search",
              "plus",
              "check",
              "calendar",
              "fridge",
              "cart",
              "book",
              "user",
              "timer",
              "flame",
              "bell",
              "settings",
              "leaf",
              "mic",
              "camera",
              "swap",
              "sparkle",
              "bookmark",
              "star",
              "barcode",
              "pencil",
              "trash",
              "heart",
            ] as const
          ).map((n) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <Icon name={n} size={20} />
              <span className="text-[9px] uppercase tracking-wider text-ink-3 font-mono">
                {n}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
