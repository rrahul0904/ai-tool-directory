-- RE-339/P1: additive catalog storage, NOT an active ingestion/publication feature.
-- Apply after 001_initial.sql, after review and an actual PostgreSQL migration test.
-- Application must redact untrusted input and validate permitted-source URLs before insert.
create extension if not exists pgcrypto;

create table if not exists public.ecosystem_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  resource_kind text not null check (resource_kind in ('mcp', 'skill', 'agent')),
  visibility text not null check (visibility in ('public', 'private')),
  tenant_id uuid,
  lifecycle text not null default 'active' check (lifecycle in ('active', 'tombstoned')),
  created_at timestamptz not null default now(),
  constraint re339_canonical_format check (
    canonical_id = lower(canonical_id) and
    canonical_id ~ '^(mcp|skill|agent):[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$' and
    resource_kind = split_part(canonical_id, ':', 1)
  ),
  constraint re339_tenant_scope check (
    (visibility = 'public' and tenant_id is null) or
    (visibility = 'private' and tenant_id is not null)
  )
);

create table if not exists public.ecosystem_source_records (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ecosystem_catalog_entries(id) on delete restrict,
  source_kind text not null check (source_kind in ('official_registry', 'github_manifest')),
  source_url text not null,
  source_revision text not null check (length(trim(source_revision)) > 0),
  rights_basis text not null check (rights_basis in ('official_api', 'publisher_permission', 'reviewed_license')),
  evidence_ref text not null check (length(trim(evidence_ref)) > 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (entry_id, id),
  constraint re339_source_permission check (
    source_url !~ '(^|/)\.{1,2}(/|$)' and
    (source_kind = 'official_registry' and rights_basis = 'official_api' and
      source_url ~ '^https://registry[.]modelcontextprotocol[.]io/v0[.]1/servers(/[A-Za-z0-9._-]+)?/?$') or
    (source_kind = 'github_manifest' and rights_basis in ('publisher_permission', 'reviewed_license') and (
      source_url ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/blob/[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+$' or
      source_url ~ '^https://raw[.]githubusercontent[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+$' or
      source_url ~ '^https://api[.]github[.]com/repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/contents/[A-Za-z0-9_./-]+$'
    ))
  )
);

create table if not exists public.ecosystem_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ecosystem_catalog_entries(id) on delete restrict,
  source_id uuid not null,
  version_label text not null check (length(trim(version_label)) between 1 and 2048),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  is_tombstone boolean not null default false,
  recorded_at timestamptz not null default now(),
  unique (entry_id, version_label),
  unique (entry_id, id),
  constraint re339_version_source_scope foreign key (entry_id, source_id)
    references public.ecosystem_source_records(entry_id, id) on delete restrict
);

create table if not exists public.ecosystem_manifests (
  version_id uuid primary key references public.ecosystem_versions(id) on delete restrict,
  manifest_kind text not null check (manifest_kind in ('mcp_server', 'skill_manifest', 'agent_manifest')),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  untrusted_text text not null default '',
  declared_capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(declared_capabilities) = 'array'),
  -- These are inert, redacted data fields. Never render untrusted_text as raw HTML or execute it.
  recorded_at timestamptz not null default now()
);

create table if not exists public.ecosystem_scan_claims (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ecosystem_versions(id) on delete restrict,
  method text not null default 'static_metadata_only' check (method = 'static_metadata_only'),
  status text not null check (status in ('not_scanned', 'signals_found', 'no_signals_observed')),
  evidence_ref text not null check (length(trim(evidence_ref)) > 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.ecosystem_compatibility_claims (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ecosystem_versions(id) on delete restrict,
  client_name text not null check (length(trim(client_name)) > 0),
  basis text not null check (basis in ('publisher_declared', 'static_metadata')),
  description text not null default '',
  evidence_ref text not null check (length(trim(evidence_ref)) > 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.ecosystem_feature_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  constraint re339_flags_disabled check (enabled = false)
);
insert into public.ecosystem_feature_flags(flag_key, enabled) values
  ('catalog',false), ('officialRegistryImport',false), ('githubManifestImport',false),
  ('staticScanning',false), ('comparison',false), ('installStudio',false), ('publicApi',false)
on conflict (flag_key) do nothing;

create or replace function public.re339_reject_snapshot_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'RE-339 provenance, versions, manifests and evidence are append-only';
end $$;

create or replace function public.re339_guard_entry_transition() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.canonical_id is distinct from old.canonical_id or
     new.resource_kind is distinct from old.resource_kind or new.visibility is distinct from old.visibility or
     new.tenant_id is distinct from old.tenant_id or
     (old.lifecycle = 'tombstoned' and new.lifecycle <> 'tombstoned') then
    raise exception 'RE-339 catalog identity/scope is immutable; tombstone is terminal';
  end if;
  return new;
end $$;
create trigger re339_entry_guard before update on public.ecosystem_catalog_entries
  for each row execute function public.re339_guard_entry_transition();

create or replace function public.re339_guard_version_insert() returns trigger language plpgsql as $$
declare existing_lifecycle text;
begin
  -- Row lock serializes concurrent inserts against tombstoning of the same entry.
  select lifecycle into existing_lifecycle from public.ecosystem_catalog_entries where id = new.entry_id for update;
  if existing_lifecycle <> 'active' then raise exception 'RE-339 cannot append after tombstone'; end if;
  return new;
end $$;
create trigger re339_version_guard before insert on public.ecosystem_versions
  for each row execute function public.re339_guard_version_insert();

create or replace function public.re339_apply_tombstone() returns trigger language plpgsql as $$
begin
  if new.is_tombstone then
    update public.ecosystem_catalog_entries set lifecycle = 'tombstoned' where id = new.entry_id;
  end if;
  return null;
end $$;
create trigger re339_version_tombstone after insert on public.ecosystem_versions
  for each row execute function public.re339_apply_tombstone();

create or replace function public.re339_reject_tombstone_manifest() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.ecosystem_versions where id = new.version_id and is_tombstone) then
    raise exception 'RE-339 tombstone cannot carry a manifest';
  end if;
  return new;
end $$;
create trigger re339_manifest_guard before insert on public.ecosystem_manifests
  for each row execute function public.re339_reject_tombstone_manifest();

create trigger re339_source_immutable before update or delete on public.ecosystem_source_records
  for each row execute function public.re339_reject_snapshot_mutation();
create trigger re339_version_immutable before update or delete on public.ecosystem_versions
  for each row execute function public.re339_reject_snapshot_mutation();
create trigger re339_manifest_immutable before update or delete on public.ecosystem_manifests
  for each row execute function public.re339_reject_snapshot_mutation();
create trigger re339_scan_immutable before update or delete on public.ecosystem_scan_claims
  for each row execute function public.re339_reject_snapshot_mutation();
create trigger re339_compatibility_immutable before update or delete on public.ecosystem_compatibility_claims
  for each row execute function public.re339_reject_snapshot_mutation();

-- P1 has no public/private catalog API. Deny all direct client access; service-role callers
-- must enforce verified tenant membership and never expose raw manifests. Do NOT add a
-- permissive tenant policy that guesses tenant_id = auth.uid().
alter table public.ecosystem_catalog_entries enable row level security;
alter table public.ecosystem_source_records enable row level security;
alter table public.ecosystem_versions enable row level security;
alter table public.ecosystem_manifests enable row level security;
alter table public.ecosystem_scan_claims enable row level security;
alter table public.ecosystem_compatibility_claims enable row level security;
alter table public.ecosystem_feature_flags enable row level security;
