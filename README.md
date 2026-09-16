# SignalIndex / ai-tool-directory

An original, production-minded reverse engineering of the AI-tool-directory submission model: public discovery, structured tool profiles, free vs premium listing tiers, editorial moderation, payment gating, SEO metadata, and click analytics.

## What is implemented

- Searchable/filterable tool directory
- Dynamic SEO-friendly tool profile pages with SoftwareApplication JSON-LD
- Five-section submission flow with required logo and up to five screenshot uploads
- Standard (free) and Premium ($79) listing tiers
- Premium payment gate with local mock checkout and real Stripe Checkout integration
- Stripe webhook payment confirmation
- Editorial admin login and moderation console
- Review state machine with server-side payment invariant
- Featured listing support
- Standard no-follow/sponsored vs Premium do-follow outbound policy
- Outbound click tracking
- Local JSON persistence for zero-dependency development
- Supabase/Postgres persistence and Supabase Storage path for production
- Sitemap, robots metadata, and `/api/health` deployment-readiness endpoint
- Unit tests and GitHub Actions verification
- Fail-closed production behavior when durable DB/payment secrets are absent

## Local run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The local admin password defaults to `admin123` only outside Vercel/production. Premium checkout runs in explicit mock mode locally.

## Production persistence

Apply `supabase/migrations/001_initial.sql` to a Supabase project, then set:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key is only referenced from server-side modules and must never be exposed as a `NEXT_PUBLIC_*` variable.

## Stripe production setup

Create a one-time $79 price and set:

```bash
PAYMENTS_MODE=stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PREMIUM_PRICE_ID=price_...
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

Configure Stripe to send `checkout.session.completed` events to `/api/payments/webhook`.

## Admin production setup

```bash
ADMIN_PASSWORD=<strong-password>
ADMIN_SESSION_SECRET=<long-random-secret>
```

The production app intentionally fails closed when those secrets are absent.

## Verification

```bash
npm run verify
```

This runs TypeScript checking, Node tests, lint, and a production Next.js build.

## Media storage

Local development writes validated PNG/JPEG/WebP uploads (max 3 MB each) to `public/uploads/`. On Vercel, local-disk writes are disabled and `/api/uploads` requires Supabase Storage configuration. The migration creates a public `tool-media` bucket while uploads still use the server-only service role.

## Deployment readiness

`GET /api/health` returns HTTP 503 in Vercel production until durable persistence, media storage, Stripe, and admin secrets are configured. This is intentional fail-closed behavior.
