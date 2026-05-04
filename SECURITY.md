# Security Policy

Hestia is a personal project, not a commercial service, but it stores data
that's adjacent to health information (diet logs, body measurements, family
member profiles) — so security reports are taken seriously.

## Reporting a vulnerability

**Please do not file public GitHub issues for security concerns.**

Email **craigcossairt@gmail.com** with:

- A description of the issue
- Steps to reproduce (proof-of-concept code if you have it)
- Your assessment of impact (data exposure? account takeover? cost abuse?)
- Whether you've disclosed it elsewhere

You'll get a response within 7 days. Confirmed issues get fixed in a private
branch first, then disclosed in the release notes once a patch ships.

## Scope

In-scope:

- The hosted instance at the production URL
- This repository's source code, build outputs, and deployment configuration
- Any Hestia-controlled subdomain

Out-of-scope:

- Third-party services Hestia depends on (Supabase, Vercel, xAI, Kroger,
  USDA, Pexels, Brave). Report to those vendors directly.
- Self-hosted forks running modified code — please report to the fork owner.
- Issues that require a malicious browser extension or already-compromised
  device.

## Self-hosters

If you've forked Hestia and run your own instance, you are responsible for
your deployment's security. Treat env vars (`XAI_API_KEY`, `SUPABASE_*`,
`KROGER_CLIENT_SECRET`, etc.) as production secrets — never commit them,
rotate any that may have been exposed, and review the RLS policies in
`supabase/migrations/` after any schema change.
