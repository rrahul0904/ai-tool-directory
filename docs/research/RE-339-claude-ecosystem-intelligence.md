# RE-339 P1 — sourced, independent ecosystem catalog contracts

Issue: https://github.com/rrahul0904/ai-tool-directory/issues/2

This is an original **data-contract/migration-only** slice for the existing SignalIndex project. The user-provided research issue records source/feedback constraints and phases; it is not evidence that any upstream product feature is implemented here. Do not scrape claudeai.directory or copy its listing data/assets, reproduce protected upstream code, or infer unverified Reddit replies or products. Future ingestion is limited to the permitted official MCP Registry API and individually permission/licence-reviewed GitHub manifests; a public GitHub URL is not itself a content-reuse licence.

## Included

- `src/lib/ecosystem/catalog.ts`: typed identities, source/version/provenance, inert/redacted manifest snapshots, static-only scan claims, declared/static compatibility claims, private/public projection and fail-closed flags. `CatalogDraft` is a local domain/test harness, **not** a database adapter or exposed API.
- `supabase/migrations/002_ecosystem_catalog_p1.sql`: additive, unapplied proposed PostgreSQL/Supabase tables; case-normalized global canonical identity; scope constraints; version+source scoped foreign key; append-only records; terminal tombstones; RLS enabled with no client policies; all flags disabled. Service-role reads are not inherently tenant-safe; future P6 needs verified membership checks and scoped queries.
- Synthetic fixtures and negative test coverage for duplicates, immutable snapshots, terminal tombstones, cross-tenant visibility, injection inertness, URL/SSRF prevalidation, permission provenance, false scan/compatibility certification and redaction. No actual URLs fetched. Static string redaction is defense-in-depth, not a guarantee against every secret format.

## Boundaries and follow-up

No runtime import, network fetching, redirects, execution of manifests, LLM instruction intake, review UI, install behavior, payment, deployment, certification, or commercial readiness. Feature flags remain false in TS and constrained false in SQL. Before a future P2 fetcher, add redirect and DNS/IP revalidation, rate-limit/backoff, licensing review, queue idempotency, content limits and server-side secret filtering. Before exposing any private entry, implement authorized tenant membership and access policies. No migrations were applied by this change; verify PostgreSQL constraints/triggers in a disposable test DB before integration.

**Baseline caveat (29 September 2026):** `main` currently stores a chunked bootstrap archive, not the unpacked application files. Latest bootstrap Actions run 35109593945 failed at its SHA-256 check before `npm install`/`npm run verify`. This P1 branch intentionally does not fix or execute the bootstrap pipeline or alter the archive, README, payment/media stack, or deployed site. Its dependency-free tests cover the new domain slice, not existing app regression; do not imply existing base behavior passed.
