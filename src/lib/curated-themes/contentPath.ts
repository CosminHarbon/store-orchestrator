/**
 * Path helpers for ContentSlots editor fields (dot paths like "hero.headline").
 * Editor keeps raw strings while typing — sanitize only on save / runtime inject.
 */
import type { ContentSlots } from './contentSlots';

export function getContentPath(content: ContentSlots, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = content;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setContentPath(content: ContentSlots, path: string, value: unknown): ContentSlots {
  const parts = path.split('.');
  if (parts.length === 1) {
    return { ...content, [parts[0]]: value } as ContentSlots;
  }
  const [head, ...rest] = parts;
  const nested = (content as Record<string, unknown>)[head];
  const base =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? { ...(nested as Record<string, unknown>) }
      : {};
  let cursor: Record<string, unknown> = base;
  for (let i = 0; i < rest.length - 1; i++) {
    const key = rest[i];
    const next = cursor[key];
    cursor[key] =
      next && typeof next === 'object' && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[rest[rest.length - 1]] = value;
  return { ...content, [head]: base } as ContentSlots;
}

/** Soft length cap while typing — does NOT trim trailing spaces. */
export function softCapText(raw: string, max?: number): string {
  if (typeof max !== 'number' || max <= 0) return raw;
  return raw.length > max ? raw.slice(0, max) : raw;
}
