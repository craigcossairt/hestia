# Hestia

A calm meal planner that pairs daily nutrition targets with an AI coach,
inventory-aware grocery lists, and recipe + cook flows.

Built on Next.js 16, Tailwind v4, Supabase, and xAI Grok. Designed as a PWA so
it installs to Android home screens with a single web codebase.

The visual design lives in [`design_handoff_meal_planner/`](./design_handoff_meal_planner)
— the README there documents tokens, primitives, and every screen.

---

## Stack

| Layer | What |
|---|---|
| Framework | Next.js 16, App Router, TypeScript, Turbopack |
| Styling | Tailwind v4 (CSS-first config in `app/globals.css`) |
| UI primitives | Custom design system in `components/ds/` |
| Data | Supabase Postgres + Auth + Storage + RLS |
| AI | Pluggable provider via Vercel AI SDK — defaults to xAI Grok, swap to OpenAI / Anthropic / Google / Vercel AI Gateway with one env var |
| Server state | TanStack Query |
| Barcode | `@zxing/browser` + Open Food Facts API |
| Hosting | Vercel (Hobby tier) |

## Local setup

1. **Install dependencies** (already done if you cloned post-scaffold):
   ```bash
   npm install
   ```

2. **Provision Supabase** (free tier):
   - Sign up at https://supabase.com and create a new project.
   - Project Settings → API → copy the project URL and the **anon** key.
   - SQL editor → paste `supabase/migrations/0001_init.sql` → Run.
   - Authentication → URL Configuration → add `http://localhost:3000/auth/callback`
     (and your production URL once deployed).

3. **Get an AI API key.** Hestia ships with xAI Grok by default — get a key
   at https://console.x.ai (free credits on signup). To use a different
   provider, see [Choosing an AI provider](#choosing-an-ai-provider) below.

4. **Configure env vars**: copy `.env.local.example` to `.env.local` and fill
   in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   XAI_API_KEY=xai-...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

### Choosing an AI provider

Hestia routes every AI call through `lib/ai/provider.ts`, which picks a
provider based on `AI_PROVIDER`. Defaults to `xai`.

| `AI_PROVIDER` | Required env | Default fast model | Default vision model |
|---|---|---|---|
| `xai` (default) | `XAI_API_KEY` | `grok-4-fast-reasoning` | `grok-2-vision-1212` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | `gpt-4o-mini` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `gateway` | `AI_GATEWAY_API_KEY` | `xai/grok-4-fast-reasoning` | `xai/grok-2-vision-1212` |

Override the model per role with `AI_MODEL_FAST` / `AI_MODEL_VISION`. With the
Vercel AI Gateway, model strings use the `provider/model-id` form (e.g.
`openai/gpt-4o-mini`) so you can pick from any supported provider with a
single key.

Example for OpenAI:
```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_MODEL_FAST=gpt-4o-mini       # optional override
```

5. **Run**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## First-run flow

1. `/login` — enter your email, click the magic link in your inbox.
2. `/onboard` — six-step form. Hestia computes a target via Mifflin–St Jeor
   and writes a narrative with Grok.
3. `/result` — target reveal.
4. `/today` — daily dashboard.

## Architecture map

```
app/
├── (app)/                  # authenticated app shell (sidebar + tab bar)
│   ├── today/              # daily dashboard
│   ├── plan/               # 7-day plan grid
│   ├── pantry/             # inventory with location tabs
│   ├── shop/               # derived grocery list
│   ├── me/                 # profile, settings, sign out
│   ├── recipes/            # library + detail + cook
│   └── layout.tsx          # shell
├── (auth)/login/           # magic-link sign-in
├── (onboarding)/           # multi-step form + result reveal
├── auth/callback/          # Supabase magic-link callback
├── api/
│   ├── ai/recipe-generate  # Grok → structured recipe
│   ├── ai/recipe-parse     # URL → fetch → Grok → recipe
│   ├── ai/substitutions    # ingredient swaps
│   ├── ai/pantry-bulk-parse # paste list → structured items
│   ├── ai/pantry-receipt   # receipt photo → Grok vision → items
│   └── pantry/barcode      # Open Food Facts lookup
├── manifest.ts             # PWA manifest
├── icon.tsx, apple-icon.tsx # generated icons (ImageResponse)
└── globals.css             # design tokens + Tailwind v4 theme

components/
├── ds/                     # design system primitives
├── shell/                  # sidebar + tab bar nav
├── onboarding/             # form components
├── today/                  # dashboard pieces
├── plan/                   # week grid + recipe picker
├── pantry/                 # tabs + cards + add modal (4 modes)
├── recipe/                 # library, detail, cook, add modal
└── grocery/                # row component

lib/
├── ai/                     # Grok provider + the 12 thread prompts
│   ├── grok.ts
│   ├── targets.ts          # Mifflin–St Jeor (deterministic)
│   └── prompts/            # blueprint, insight, recipe, pantry
├── grocery/derive.ts       # plan ∩ pantry → list grouped by aisle
├── supabase/               # client, server, middleware
├── types/database.ts       # hand-rolled DB types
└── utils.ts                # cn() helper

supabase/migrations/
└── 0001_init.sql           # schema, RLS, auto-create profile trigger
```

## Deployment (Vercel)

1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo.
3. Set the same env vars in Project Settings → Environment Variables (set
   `NEXT_PUBLIC_APP_URL` to your production URL).
4. Add the production callback URL to Supabase Auth → URL Configuration.
5. Deploy.

## Installing on Android

Open the deployed URL in Chrome on Android → tap menu → **Add to Home Screen**.
The PWA manifest takes over and the app launches standalone.

## Next steps (out of v1 scope)

- Stats + long-term tracking (sketch in handoff).
- Programs library, Sunday Prep timeline, Family meals, Coach chat.
- Service worker for offline (manifest is shipped; SW deferred).
- Drag-to-reschedule on the Plan grid (currently click-to-assign).
- Seed recipe library — script lives in plan, not yet executed.
- Settings page polish — see plan file for the prompt ready to paste into
  Claude Design.

## Design system preview

`/dev/ds` renders every primitive — useful when iterating on tokens or adding
new variants.

## Verification checklist

| Check | How |
|---|---|
| Build green | `npm run build` |
| All routes | 21 routes including 6 dynamic API endpoints |
| Magic link | sign in, check Supabase logs for the email |
| Onboarding | walk all 6 steps → land on `/result` with kcal target |
| AI | Add Recipe → Ask Hestia → "high-protein dinner" generates a real recipe |
| Pantry derive | bulk-paste → save 5 items → assign a recipe to today's dinner → /shop shows what's missing |
| RLS | sign in as a second user → cannot read first user's pantry/plan via SQL editor |
| PWA | open deployed URL in Chrome on Android → Add to Home Screen → opens standalone |
