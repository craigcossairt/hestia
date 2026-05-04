# Hestia

> In Greek mythology, **Hestia** was the goddess of the hearth, home, and
> family — the keeper of the sacred fire that was never allowed to go out.
> She got the first offering at every meal. Quietly central rather than
> dramatically powerful: the household ritual of feeding the people you love.
>
> That's the app. A calm meal planner that sits with you at the kitchen
> counter — daily nutrition targets, an AI coach who knows your household,
> inventory-aware grocery lists, and recipe + cook flows. Not a tracker that
> shames you. A hearth.

Built over the course of a weekend as a personal project, kept as one. Open-sourced under MIT so anyone
can fork it and run their own instance.

---

## What's in it

| Surface | What it does |
|---|---|
| **/today** | Daily dashboard — kcal + macro rings, today's meals, quick-log |
| **/plan** | 7-day grid, AI-generated weekly plans, drag-to-rearrange |
| **/inventory** | Pantry + fridge + freezer with barcode scan, receipt OCR, paste-bulk |
| **/shop** | Plan ∩ inventory → grocery list, optional Kroger pricing + send-to-cart |
| **/recipes** | Library, AI generation, URL import, photo OCR import, cook mode |
| **/coach** | Chat with an AI that knows your targets, pantry, and household |
| **/programs** | Multi-active programs (Family Meals, 16:8 IF, Workout Fuel, …) |
| **/family** | Per-member profiles + per-member program assignments |
| **/stats** | Long-term trend view (weight, macros, adherence) |
| **/me** | Profile, dietary preferences, dark mode, integrations, sign out |

Designed mobile-first as a PWA — installs to iOS/Android home screens with
the same web codebase. No app store, no native build.

## Stack

| Layer | What |
|---|---|
| Framework | **Next.js 16** App Router, TypeScript, Turbopack |
| Styling | **Tailwind v4** (CSS-first config in `app/globals.css`) |
| UI primitives | Custom design system in `components/ds/` |
| Data | **Supabase** Postgres + Auth (OTP) + Storage + Row-Level Security |
| AI | Pluggable provider via **Vercel AI SDK** — defaults to xAI Grok, swap to OpenAI / Anthropic / Google / Vercel AI Gateway with one env var |
| Server state | TanStack Query |
| Barcode | `@zxing/browser` + Open Food Facts API |
| Nutrition refinement | USDA FoodData Central |
| Grocery | Kroger Public API (Locations + Products + Cart + Profile) |
| Photos | og:image → Brave → Pexels → AI image gen → stylised SVG |
| Hosting | Vercel (Hobby tier is enough for a household) |

## Try it

The hosted instance at the production URL is **private to my immediate
family** — sign-up is gated by an email allowlist (see *Limit who can sign
up*, below). To try Hestia, the path is to fork and deploy your own. Setup
is ~15 minutes if you have a Supabase + Vercel account, and runs entirely
on free tiers for personal use.

---

## Self-host

### 1. Clone + install

```bash
git clone https://github.com/craigcossairt/hestia.git
cd hestia
npm install
```

### 2. Provision Supabase (free tier)

- Create a project at https://supabase.com.
- Project Settings → API → copy the project URL and the **anon** key.
- SQL editor → paste each file in `supabase/migrations/` **in order**
  (0001 → 0018+) → Run.
- Authentication → URL Configuration → add `http://localhost:3000/auth/callback`
  (and your production URL once deployed).
- Authentication → Email Templates → optional: customise the OTP email
  subject so it doesn't look like a Supabase notification.

### 3. Pick an AI provider

Hestia ships with xAI Grok by default — get a key at https://console.x.ai
(free credits on signup). To use a different provider, see *Choosing an AI
provider* below.

### 4. Configure env vars

Copy `.env.local.example` to `.env.local` and fill in at minimum:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
XAI_API_KEY=xai-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The example file documents every optional integration (Brave, Pexels,
USDA, Kroger) with what they unlock and where to get the keys.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

### 6. Deploy to Vercel

1. Push your fork to GitHub.
2. https://vercel.com/new → import the repo.
3. Set the same env vars in Project Settings → Environment Variables (set
   `NEXT_PUBLIC_APP_URL` to your production URL).
4. Add the production callback URL to Supabase Auth → URL Configuration.
5. Deploy.

For Kroger integration also add the production redirect URI exactly as
`{NEXT_PUBLIC_APP_URL}/api/kroger/oauth/callback` to your Kroger app's
Production environment.

---

## Limit who can sign up

If you're hosting an instance and only want specific people to sign in
(e.g. household members on your own deployment), set:

```
SIGNUP_ALLOWLIST=alice@example.com,bob@example.com
```

When set, only the listed addresses can request a magic code on `/login`
— everyone else gets a friendly note pointing them at this repo to run
their own instance. Leave unset for fully-open sign-up.

---

## Setting up a public demo deploy

If you want a separate "anyone can try without signing up" instance —
distinct from your real one — the pattern is:

1. **Create a second Supabase project** for demo data only. Run all
   migrations in order, same as a normal install.
2. **Manually create one demo user** in the demo project's Auth tab
   (e.g. `demo@hestia.app`). Note its UUID.
3. **Seed it.** From your local clone, with the demo project's URL
   and service-role key:
   ```bash
   SUPABASE_URL=https://<demo>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
   DEMO_USER_ID=<uuid-from-step-2> \
   npx tsx scripts/seed-demo.ts
   ```
   The script wipes + reseeds a realistic household (one adult, two
   kids, full pantry, weekly plan, eight weeks of weight logs, the
   curated starter recipe library). Re-run any time you want a fresh
   demo state.
4. **Deploy to a separate Vercel project** (`hestia-demo` or similar)
   with env vars pointing at the demo Supabase, and either:
   - leave `SIGNUP_ALLOWLIST` set to just the demo email (most robust), or
   - leave it unset (open sign-up — fine for a throwaway DB).
5. **Document the demo creds** somewhere visitors will find them
   (landing page, README badge, etc.).

A nightly cron that re-runs `seed-demo.ts` keeps the data fresh.

---

## Choosing an AI provider

Hestia routes every AI call through `lib/ai/provider.ts`, which picks a
provider based on `AI_PROVIDER`. Defaults to `xai`.

| `AI_PROVIDER` | Required env | Default fast model | Default vision model |
|---|---|---|---|
| `xai` (default) | `XAI_API_KEY` | `grok-4-fast-reasoning` | `grok-2-vision-1212` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | `gpt-4o-mini` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `gateway` | `AI_GATEWAY_API_KEY` | `xai/grok-4-fast-reasoning` | `xai/grok-2-vision-1212` |

Override the model per role with `AI_MODEL_FAST` / `AI_MODEL_BULK` /
`AI_MODEL_VISION` / `AI_MODEL_IMAGE`. With the Vercel AI Gateway, model
strings use the `provider/model-id` form so you can pick from any
supported provider with a single key.

### Consistency across providers

Every Hestia AI call prefixes a shared **`BASE_SYSTEM`** block
(`lib/ai/prompts/system.ts`) defining the assistant's voice, US-units
convention, and hard rules around allergies / medical conditions / honest
macros. Switching `AI_PROVIDER` keeps the same instructions in front of
every model — outputs stay structurally consistent.

Sampling defaults (`AI_TEMPERATURE`, optional `AI_SEED`) are also shared
via `getModelOpts()`, so deterministic-leaning behaviour carries across
providers.

### Recipe photos

When a recipe is generated or imported, Hestia tries:

1. **og:image** of the source page (URL-imported recipes)
2. **Brave web image search** (set `BRAVE_SEARCH_API_KEY`, free 2k/month)
3. **Pexels search** (set `PEXELS_API_KEY`, free, generous tier)
4. **AI image generation** if your provider supports it
5. **Stylised SVG fallback** — every recipe always has a visual

### Nutrition refinement

When `USDA_API_KEY` is set, AI-generated recipe macros get refined against
real USDA per-100g values whenever ingredients can be matched with high
confidence. The AI's estimate is kept as a fallback when coverage is too
low to trust. Free, 1k requests/hour. Get a key at
https://fdc.nal.usda.gov/api-key-signup.html

---

## Cost expectations

Running Hestia for a single household on free tiers, expect roughly:

| Service | Tier | Monthly cost |
|---|---|---|
| Vercel | Hobby | $0 |
| Supabase | Free | $0 (< 500MB DB, < 1GB storage) |
| xAI Grok | Pay-as-you-go | $1–5 for ~1 active user |
| USDA FDC | Free | $0 |
| Brave Search | Free | $0 (under 2k queries/month) |
| Pexels | Free | $0 |
| Kroger Public API | Free (Personal App) | $0 |

xAI is the only meaningful variable cost. A typical week — generating one
weekly plan, ~10 recipe creations, ~20 quick-logs, daily Coach use — runs
about $1. Plan generation is the biggest single cost (~$0.30 per
21-meal plan with live web search enabled) so set `AI_DISABLE_SEARCH=true`
if you want to drop that to ~$0.05.

For multiple users on a shared hosted instance: rate-limit the AI
endpoints. (Not yet implemented in this codebase — see open issues.)

---

## First-run flow

1. `/login` — enter your email, paste the OTP code from your inbox.
2. `/onboard` — multi-step form. Hestia computes a target via Mifflin–St
   Jeor and writes a narrative with your AI provider.
3. `/result` — target reveal.
4. `/today` — daily dashboard.

---

## Architecture map

```
app/
├── (app)/                  # authenticated app shell (sidebar + tab bar)
│   ├── today/              # daily dashboard
│   ├── plan/               # 7-day plan grid
│   ├── inventory/          # pantry + fridge + freezer
│   ├── shop/               # derived grocery list + Kroger integration
│   ├── recipes/            # library + detail + cook + edit
│   ├── coach/              # AI chat with household context
│   ├── programs/           # multi-active programs library
│   ├── family/             # per-member profiles
│   ├── stats/              # long-term trends
│   ├── me/                 # profile, settings, integrations, sign out
│   └── layout.tsx          # shell
├── (auth)/login/           # OTP sign-in
├── (onboarding)/           # multi-step form + result reveal
├── auth/callback/          # Supabase OAuth callback
├── api/
│   ├── ai/
│   │   ├── coach/chat              # streaming chat
│   │   ├── estimate-macros         # quick-log → macros (with FDC refine)
│   │   ├── family-tonight          # plate-by-plate dinner builder
│   │   ├── insights/generate       # daily insight cron
│   │   ├── pantry-bulk-parse       # paste list → structured items
│   │   ├── pantry-receipt          # receipt photo → vision → items
│   │   ├── plan-week               # 7-day plan generation (preview/refine/save)
│   │   ├── recipe-generate         # prompt → structured recipe
│   │   ├── recipe-parse            # URL → fetch → structured recipe
│   │   ├── recipe-photo            # cookbook page → vision → recipe
│   │   ├── substitutions           # ingredient swaps
│   │   └── sunday-prep             # batch-cook timeline
│   ├── cron/daily-insights         # Vercel cron
│   ├── kroger/oauth/{start,callback}  # per-user Kroger OAuth
│   └── pantry/barcode              # Open Food Facts lookup
├── manifest.ts             # PWA manifest
├── icon.png, apple-icon.png # app icons
└── globals.css             # design tokens + Tailwind v4 theme

components/
├── ds/                     # design system primitives (Btn, Card, Drawer, …)
├── shell/                  # sidebar + mobile tab bar + More sheet
├── onboarding/             # multi-step form
├── today/                  # dashboard pieces
├── plan/                   # week grid + recipe picker
├── inventory/              # pantry/fridge/freezer + add modal
├── recipe/                 # library, detail, cook, add modal
├── grocery/                # row + send-to-cart
├── coach/                  # chat UI
├── programs/               # program cards + activate
├── family/                 # member cards + tonight builder
├── stats/                  # trend charts
└── me/                     # profile sections (kroger, never-shop, etc.)

lib/
├── ai/
│   ├── provider.ts                 # pluggable getModel()/getProviderOptions()
│   ├── photo.ts                    # resolveRecipePhoto() chain
│   ├── targets.ts                  # Mifflin–St Jeor (deterministic)
│   └── prompts/                    # system + per-route prompt builders
├── grocery/derive.ts               # plan ∩ inventory → grouped list
├── inventory/                      # location + decrement helpers
├── kroger/                         # banners, package-size, cart, products
├── nutrition/                      # FDC refinement, portion conversion
├── programs/                       # program registry + kind helpers
├── recipes/                        # save, photo persist
├── seed/                           # starter recipe library
├── supabase/                       # client, server, middleware
├── types/database.ts               # hand-rolled DB types
└── family.ts                       # member typedef + helpers

supabase/migrations/                # 0001 → 0018+, run in order
```

---

## Verification checklist

| Check | How |
|---|---|
| Build green | `npm run build` |
| Type-check | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| OTP sign-in | `/login` → enter email → paste code from inbox |
| Onboarding | walk all steps → land on `/result` with kcal target |
| AI generate | `/recipes` → + Add → "high-protein dinner" → recipe lands |
| Pantry derive | bulk-paste → save 5 items → assign recipe → `/shop` shows what's missing |
| RLS | sign in as a second user → cannot read first user's data via SQL editor |
| PWA | open deployed URL in Chrome/Safari on phone → Add to Home Screen → opens standalone |
| Allowlist | set `SIGNUP_ALLOWLIST=` to a single email → other addresses are rejected |

---

## Design system preview

`/dev/ds` renders every primitive — useful when iterating on tokens or
adding new variants.

---

## Contributing

This is a personal project so PRs aren't actively solicited, but if you
fix a bug or add something useful, open an issue first to talk it
through. See [SECURITY.md](./SECURITY.md) for vulnerability reports.

## License

[MIT](./LICENSE) — fork it, modify it, ship your own. Attribution
appreciated but not required.

The name *Hestia* is from public-domain Greek mythology; if you want to
keep using it for your fork that's fine, but a different name often
helps people find your project distinct from this one.
