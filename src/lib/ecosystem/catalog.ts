/** RE-339 P1: local catalog contracts only. This module performs no HTTP requests, execution, or publishing. */
export type ResourceKind = 'mcp' | 'skill' | 'agent';
export type Visibility = 'public' | 'private';
export type SourceKind = 'official_registry' | 'github_manifest';
export type RightsBasis = 'official_api' | 'publisher_permission' | 'reviewed_license';
export type ManifestKind = 'mcp_server' | 'skill_manifest' | 'agent_manifest';

export interface SourceProvenance {
  kind: SourceKind;
  url: string;
  sourceRevision: string;
  observedAt: string;
  rightsBasis: RightsBasis;
  evidenceRef: string; // Reviewer-controlled citation/permission record, not a pasted secret.
}
export interface ResourceManifest {
  kind: ManifestKind;
  title: string;
  description: string;
  untrustedText: string; // Data, never instructions to an agent, shell, installer, or renderer.
  declaredCapabilities: string[];
}
export interface StaticScanClaim {
  method: 'static_metadata_only';
  status: 'not_scanned' | 'signals_found' | 'no_signals_observed';
  evidenceRef: string;
  observedAt: string;
}
export interface CompatibilityClaim {
  client: string;
  basis: 'publisher_declared' | 'static_metadata';
  description: string;
  evidenceRef: string;
  observedAt: string;
}
export interface CatalogVersion {
  label: string;
  contentSha256: string;
  source: SourceProvenance;
  manifest: ResourceManifest | null;
  tombstone: boolean;
  scanClaims: StaticScanClaim[];
  compatibilityClaims: CompatibilityClaim[];
}
export interface CatalogEntry {
  canonicalId: string;
  kind: ResourceKind;
  visibility: Visibility;
  tenantId: string | null;
  lifecycle: 'active' | 'tombstoned';
}
export interface VisibleCatalogItem {
  canonicalId: string;
  kind: ResourceKind;
  visibility: Visibility;
  title: string;
  description: string;
  version: string;
  scanStatus: StaticScanClaim['status'];
  compatibility: {client: string; basis: CompatibilityClaim['basis']}[];
  /** No scan or publisher assertion here constitutes a safety certification. */
  evidenceNotice: 'Unverified metadata claims; not a safety or compatibility certification';
}

/** All switches are off. P1 must not activate fetching, execution, or publication. */
export const ECOSYSTEM_FEATURE_FLAGS = Object.freeze({
  catalog: false,
  officialRegistryImport: false,
  githubManifestImport: false,
  staticScanning: false,
  comparison: false,
  installStudio: false,
  publicApi: false,
} as const);
export function isEcosystemFeatureEnabled(flag: string): boolean {
  return Object.hasOwn(ECOSYSTEM_FEATURE_FLAGS, flag) &&
    Boolean((ECOSYSTEM_FEATURE_FLAGS as Record<string, boolean>)[flag]);
}

const CANONICAL_ID = /^(mcp|skill|agent):[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
function requireNonempty(value: string, field: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error(`Invalid ${field}`);
}
export function canonicalizeId(raw: string): string {
  if (typeof raw !== 'string') throw new Error('Invalid canonical ID');
  const id = raw.trim().toLowerCase();
  if (!CANONICAL_ID.test(id)) throw new Error('Invalid canonical ID');
  return id;
}

/** Validate provenance without dereferencing it. No redirects, DNS, proxy, or network activity in P1. */
export function assertPermittedSource(source: SourceProvenance): void {
  if (!source || !['official_registry', 'github_manifest'].includes(source.kind)) throw new Error('Unsupported source');
  for (const field of ['sourceRevision', 'observedAt', 'evidenceRef'] as const) requireNonempty(source[field], field);
  if (!Number.isFinite(Date.parse(source.observedAt))) throw new Error('Invalid provenance timestamp');
  if (!['official_api', 'publisher_permission', 'reviewed_license'].includes(source.rightsBasis)) throw new Error('Missing rights review');
  if (source.kind === 'official_registry' && source.rightsBasis !== 'official_api') throw new Error('Wrong official API rights basis');
  if (source.kind === 'github_manifest' && source.rightsBasis === 'official_api') throw new Error('GitHub contents require source permission review');
  let url: URL;
  try { url = new URL(source.url); } catch { throw new Error('Invalid source URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      /[%\\]/.test(source.url) || url.origin !== `https://${url.hostname}`) throw new Error('Unsafe source URL');
  const path = url.pathname;
  if (source.kind === 'official_registry') {
    if (url.hostname !== 'registry.modelcontextprotocol.io' || !/^\/v0\.1\/servers(?:\/[a-zA-Z0-9._-]+)?\/?$/.test(path))
      throw new Error('Unapproved registry endpoint');
  } else {
    const permitted =
      (url.hostname === 'github.com' && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[A-Za-z0-9_.-]+\/.+/.test(path)) ||
      (url.hostname === 'raw.githubusercontent.com' && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/.+/.test(path)) ||
      (url.hostname === 'api.github.com' && /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/contents\/.+/.test(path));
    if (!permitted || path.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Unapproved manifest endpoint');
  }
}

/** Conservative presentation/ingest redaction, not a substitute for secret scanning or manual review. */
export function redactSensitiveText(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid catalog text');
  return value
    .replace(/\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{12,}\b/g, '[REDACTED]')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(api[_-]?key|client[_-]?secret|access[_-]?token|token|password|authorization)\s*[:=]\s*['"]?[^\s'",;]+['"]?/gi, '$1=[REDACTED]');
}
function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
function scrubManifest(manifest: ResourceManifest): ResourceManifest {
  if (!manifest || !['mcp_server', 'skill_manifest', 'agent_manifest'].includes(manifest.kind)) throw new Error('Invalid manifest kind');
  requireNonempty(manifest.title, 'manifest title');
  if (!Array.isArray(manifest.declaredCapabilities) || manifest.declaredCapabilities.length > 100) throw new Error('Invalid capabilities');
  for (const item of manifest.declaredCapabilities) requireNonempty(item, 'capability');
  return {
    kind: manifest.kind,
    title: redactSensitiveText(manifest.title),
    description: redactSensitiveText(manifest.description),
    untrustedText: redactSensitiveText(manifest.untrustedText),
    declaredCapabilities: manifest.declaredCapabilities.map(redactSensitiveText),
  };
}

/** Standalone P1 domain harness, not wired into the current app or a database adapter. */
export class CatalogDraft {
  #entries = new Map<string, CatalogEntry>();
  #versions = new Map<string, CatalogVersion[]>();

  addEntry(input: Pick<CatalogEntry, 'canonicalId' | 'visibility' | 'tenantId'>): CatalogEntry {
    const id = canonicalizeId(input.canonicalId);
    if (this.#entries.has(id)) throw new Error('Duplicate canonical ID');
    if (input.visibility !== 'public' && input.visibility !== 'private') throw new Error('Invalid visibility');
    if ((input.visibility === 'public' && input.tenantId !== null) ||
        (input.visibility === 'private' && (!input.tenantId || !UUID.test(input.tenantId))))
      throw new Error('Invalid tenant scope');
    const entry = freezeSnapshot({canonicalId: id, kind: id.split(':')[0] as ResourceKind,
      visibility: input.visibility, tenantId: input.tenantId, lifecycle: 'active' as const});
    this.#entries.set(id, entry);
    this.#versions.set(id, []);
    return entry;
  }

  appendVersion(rawId: string, proposed: CatalogVersion): CatalogVersion {
    const id = canonicalizeId(rawId);
    const entry = this.#entries.get(id);
    if (!entry) throw new Error('Catalog entry does not exist');
    if (entry.lifecycle === 'tombstoned') throw new Error('Tombstone is terminal');
    const versions = this.#versions.get(id)!;
    requireNonempty(proposed.label, 'version label');
    if (versions.some(version => version.label === proposed.label)) throw new Error('Immutable version already exists');
    if (!SHA256.test(proposed.contentSha256)) throw new Error('Invalid SHA-256 digest');
    assertPermittedSource(proposed.source);
    if (proposed.tombstone ? proposed.manifest !== null : proposed.manifest === null) throw new Error('Invalid tombstone manifest');
    if (!Array.isArray(proposed.scanClaims) || !Array.isArray(proposed.compatibilityClaims)) throw new Error('Invalid claims');
    for (const claim of proposed.scanClaims) {
      if (claim.method !== 'static_metadata_only' || !['not_scanned', 'signals_found', 'no_signals_observed'].includes(claim.status)) throw new Error('Unverified scan method');
      requireNonempty(claim.evidenceRef, 'scan evidence');
      if (!Number.isFinite(Date.parse(claim.observedAt))) throw new Error('Invalid scan timestamp');
    }
    for (const claim of proposed.compatibilityClaims) {
      if (!['publisher_declared', 'static_metadata'].includes(claim.basis)) throw new Error('Unsupported compatibility basis');
      requireNonempty(claim.client, 'client');
      requireNonempty(claim.evidenceRef, 'compatibility evidence');
      if (!Number.isFinite(Date.parse(claim.observedAt))) throw new Error('Invalid compatibility timestamp');
    }
    const version: CatalogVersion = freezeSnapshot({
      label: proposed.label, contentSha256: proposed.contentSha256,
      source: structuredClone(proposed.source),
      manifest: proposed.manifest ? scrubManifest(proposed.manifest) : null,
      tombstone: proposed.tombstone,
      scanClaims: structuredClone(proposed.scanClaims),
      compatibilityClaims: proposed.compatibilityClaims.map(claim => ({...claim, description: redactSensitiveText(claim.description)})),
    });
    versions.push(version);
    if (version.tombstone) this.#entries.set(id, freezeSnapshot({...entry, lifecycle: 'tombstoned' as const}));
    return version;
  }

  listVisible(viewerTenantId: string | null): VisibleCatalogItem[] {
    const result: VisibleCatalogItem[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.lifecycle !== 'active' || (entry.visibility === 'private' && entry.tenantId !== viewerTenantId)) continue;
      const latest = this.#versions.get(entry.canonicalId)!.at(-1);
      if (!latest || !latest.manifest || latest.tombstone) continue;
      result.push({canonicalId: entry.canonicalId, kind: entry.kind, visibility: entry.visibility,
        title: latest.manifest.title, description: latest.manifest.description, version: latest.label,
        scanStatus: latest.scanClaims.at(-1)?.status ?? 'not_scanned',
        compatibility: latest.compatibilityClaims.map(({client, basis}) => ({client, basis})),
        evidenceNotice: 'Unverified metadata claims; not a safety or compatibility certification'});
    }
    return result;
  }
}
