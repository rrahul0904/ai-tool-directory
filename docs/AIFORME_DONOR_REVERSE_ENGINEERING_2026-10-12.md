# AIForme donor reverse engineering — 2026-10-12

## Source and evidence boundary

Primary discovery source: https://www.reddit.com/r/SideProject/comments/1x3tf56/looking_for_partners_you_build_i_market/

Comment-linked product: https://aiforme.shop/

Publicly observed surface at review time:

- Search tools
- Newsstand
- List your tool
- Compare basket with an explicit count
- Compare now action
- Store-style language around tools being live, compared, opened, and picked up

Independent public curated lists also describe AIForme as an AI-tool discovery platform with a comparison feature.

The accessible site is highly dynamic and the crawler exposed only a small public shell, so hidden categories, ranking logic, monetization, data sources, private APIs, moderation flow, and backend architecture remain unknown. Do not invent them.

## Canonical destination

This is **not** a new product. It maps directly to the existing owned `rrahul0904/ai-tool-directory` / SignalIndex product.

SignalIndex already implements:

- searchable/filterable AI-tool discovery
- SEO-friendly tool profiles and structured metadata
- tool submission workflow
- free vs premium listing tiers
- Stripe payment gating
- editorial moderation
- featured listings
- outbound click tracking
- Supabase/Postgres production persistence
- sitemap/robots/deployment health gates

The high-value donor gap is **decision support after discovery**, especially comparison and editorial discovery.

## MATCH / IMPROVE / NEW / OMIT

| Capability | Decision | SignalIndex requirement |
|---|---|---|
| Tool search/discovery | MATCH | Retain existing search/filter surface. |
| Tool listing/submission | MATCH | Retain structured submission + moderation. |
| Tool profile pages | MATCH/IMPROVE | Add normalized comparison attributes and evidence freshness. |
| Compare basket | NEW/P0 | Let users select up to 4 tools from cards/profile/search and persist basket client-side/account-side. |
| Side-by-side comparison | NEW/P0 | Compare normalized features, pricing model, free tier/trial, platform, integrations, API availability, privacy/security claims, deployment model, and use cases. |
| Newsstand/editorial | NEW/P1 | Editorial feed for launches, meaningful updates, benchmarks, and curated workflows tied to tool records. |
| Live store counters | OMIT unless grounded | Do not display synthetic activity counters. Only show verified analytics/aggregates with clear definitions. |
| Recommendation/ranking | IMPROVE/P1 | Explain ranking factors and distinguish editorial, popularity, sponsored, and personalized ordering. |
| Claim verification | NEW/P1 | Store claim source, observed_at, evidence URL, confidence, and stale/contradicted state. |
| Affiliate/sponsored placement | MATCH/IMPROVE | Preserve explicit sponsored/nofollow policy and never blend paid placement into organic ranking without labels. |

## Comparison domain model

### ComparisonAttribute

- key
- label
- type: boolean | enum | number | text | list | price
- category
- source_policy
- stale_after_days nullable

### ToolAttributeValue

- tool_id
- attribute_key
- normalized_value
- display_value
- source_url
- source_kind: vendor | store | docs | independent | editorial
- observed_at
- confidence
- verification_state: claimed | observed | corroborated | contradicted | unknown

### CompareSet

- id
- owner/session
- tool_ids (max 4)
- created_at / updated_at
- share_token nullable

## P0 — comparison engine

1. Define a stable normalized comparison schema.
2. Add Compare buttons on directory cards and tool profiles.
3. Persist a 2–4 tool basket.
4. Add `/compare` side-by-side table with difference highlighting.
5. Hide unsupported/unknown attributes rather than fabricating values.
6. Add shareable compare URL only after canonical slug/ID behavior is stable.

Acceptance:

- Same tool records render deterministic compare rows.
- Unknown is visually distinct from false/no.
- Sponsored status does not change factual comparison values.
- Comparison page is keyboard accessible and usable on mobile.
- Removing a tool updates URL/state without orphaned records.

## P1 — Newsstand + evidence freshness

1. Add editorial `NewsItem` tied to one or more tool IDs.
2. Track event type: launch, feature update, pricing change, acquisition, benchmark, security/privacy change, deprecation.
3. Require source URL + published/observed date.
4. Add stale-claim detection for pricing/features.
5. Surface changelog context on tool profiles and compare rows.

Acceptance:

- News cannot silently overwrite tool facts; it creates evidence that an editor can approve into the canonical profile.
- Conflicting sources are preserved and marked, not collapsed into a guessed answer.

## P2 — decision assistant

Build an optional grounded assistant over the directory:

`user job → hard constraints → candidate filter → comparison evidence → ranked shortlist → reasoned recommendation`

Rules:

- Recommendations cite the exact tool attributes/evidence used.
- Paid placement is never treated as quality evidence.
- Missing data lowers confidence.
- User constraints beat popularity.

## Failure/adversarial matrix

- Duplicate tools / renamed tools
- Vendor self-submission with inflated claims
- Price pages changed after crawl
- Conflicting free-tier or privacy claims
- Affiliate redirect failure
- Compare basket with deleted/moderated tool
- Script/HTML injection in tool descriptions
- Sponsored tool attempting to influence organic ordering
- Mass submissions / spam
- Broken screenshots or unsafe external media

## Verification ladder

Schema → normalization tests → compare-state unit tests → moderation/claim contract tests → SEO/structured-data checks → browser compare UAT → mobile/accessibility → persistence → stale/conflict fixtures → preview deployment → exact-SHA certification.

## Current status

- Source/comment discovery: **complete to current public snapshot**.
- Dedupe/canonical destination: **verified — existing SignalIndex / ai-tool-directory**.
- Gap identified: **comparison is a high-priority missing capability**; Newsstand is the next differentiated surface.
- Implementation: **not yet claimed** in this branch.

Next concrete action: implement the P0 normalized comparison schema and deterministic compare UI once the bootstrap source is materialized into the normal repository tree.
