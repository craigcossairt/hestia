# Contributing to Hestia

Hestia is a personal project shared in public. PRs aren't actively
solicited but are appreciated when they land — the bar is low, the
feedback is honest, and we're all just trying to feed our families.

## Before opening a PR

1. **Open an issue first** if you're proposing anything bigger than a
   small bug fix or doc tweak. A 10-line comment thread saves a 500-line
   PR that goes the wrong direction.
2. **Read [`AGENTS.md`](./AGENTS.md).** Hestia runs on Next.js 16, which
   has breaking changes from Next 14/15 your training data + IDE
   autocomplete may not know about. The middleware file is `proxy.ts`,
   not `middleware.ts`. Service worker path patterns differ. When in
   doubt, the source of truth is `node_modules/next/dist/docs/`.
3. **Run the verification list** from the [README](./README.md#verification-checklist)
   locally before pushing — `npm run build`, `npx tsc --noEmit`, lint.

## Branch + PR conventions

- Branch off `main` with a short scope-prefixed name:
  - `feat/...` for features
  - `fix/...` for bug fixes
  - `chore/...` for tooling, docs, refactors with no behaviour change
  - `perf/...` for performance work
- One logical change per PR. Don't bundle a feature with an unrelated
  refactor.
- PR title and commit messages use conventional-commit style:
  `feat(grocery): merge plurals when computing the cart`. Helps both
  changelog scanning and the PR template.
- Every PR description should have a *Summary* (2–3 bullets) and *Test
  plan* (a checklist of what you verified). The PR template prefills
  this.

## Coding style

- TypeScript strict mode is on; respect it. No `any` unless you've
  exhausted the alternatives.
- Prefer Server Components and Server Actions for data flow. Client
  Components only when you need browser APIs, interactive state, or
  TanStack Query.
- Tailwind v4, CSS-first config. No utility classes invented in
  `app/globals.css` — use existing tokens.
- Comments explain *why*, not *what*. The diff already shows what.
- Keep dependencies lean. Adding a new npm package needs a one-line
  justification in the PR description (what does it replace, why).

## Tests

There is no test suite (yet). Hestia has been verified by hand against
the README checklist. If your PR adds a piece of logic that's hard to
sanity-check by clicking through the UI (date math, unit conversion,
program-conflict resolution, RLS policies), include a short test in
`__tests__/` next to the file under test. Vitest is the assumed runner;
wire it up in your PR if it's not there yet.

## Database changes

- New migrations go in `supabase/migrations/` numbered sequentially
  (`00NN_short_description.sql`).
- Migrations must be **safe to run in production** as-is — the user
  pastes them straight into the Supabase SQL editor. No destructive
  drops without an explicit migration plan and a heads-up in the PR.
- Every user-data table needs RLS enabled with policies covering all
  CRUD operations. The audit query in PR #34 shows the pattern.

## Security

If you spot a vulnerability, **do not open a public issue**. See
[SECURITY.md](./SECURITY.md) for the disclosure process.

## Code of conduct

Be kind, be specific, be brief. Don't be a jerk to anyone in the
issue tracker. That's the whole policy.

## License

By contributing, you agree your contributions will be licensed under
the [MIT License](./LICENSE) — same as the rest of the project.
