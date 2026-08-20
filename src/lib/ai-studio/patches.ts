import type { StorefrontSpec } from './spec';
import { parseStorefrontSpec } from './spec';

export interface JsonPatch {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

export function applyJsonPatches(spec: StorefrontSpec, patches: JsonPatch[]): StorefrontSpec {
  let current: unknown = structuredClone(spec);
  for (const patch of patches) {
    current = applyOne(current, patch);
  }
  const { spec: next } = parseStorefrontSpec(current);
  return next;
}

function applyOne(doc: unknown, patch: JsonPatch): unknown {
  const tokens = parsePath(patch.path);
  if (tokens.length === 0) {
    if (patch.op === 'replace' && patch.value && typeof patch.value === 'object') return patch.value;
    return doc;
  }

  const root = clone(doc);
  let parent: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    parent = descend(parent, tokens[i]);
  }
  const last = tokens[tokens.length - 1];
  if (!parent || typeof parent !== 'object') return root;

  if (Array.isArray(parent)) {
    const idx = last === '-' ? parent.length : Number(last);
    if (patch.op === 'remove') {
      if (Number.isInteger(idx)) parent.splice(idx, 1);
    } else if (patch.op === 'add') {
      if (last === '-') parent.push(patch.value);
      else if (Number.isInteger(idx)) parent.splice(idx, 0, patch.value);
    } else if (Number.isInteger(idx)) {
      parent[idx] = patch.value;
    }
    return root;
  }

  const rec = parent as Record<string, unknown>;
  if (patch.op === 'remove') delete rec[last];
  else rec[last] = patch.value;
  return root;
}

function parsePath(path: string): string[] {
  if (!path || path === '/') return [];
  return path
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function descend(parent: unknown, key: string): unknown {
  if (Array.isArray(parent)) return parent[Number(key)];
  if (parent && typeof parent === 'object') return (parent as Record<string, unknown>)[key];
  return undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
