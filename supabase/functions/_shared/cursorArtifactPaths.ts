/**
 * Prefer packaged storefront archives over incidental JS/CSS asset uploads.
 */

export type ArtifactListItem = { path: string };

const BUILD_BLOCKED = /(?:^|\/)BUILD_BLOCKED\.txt$/i;
const STOREFRONT_TAR = /(?:^|\/)storefront-build\.tar\.gz$/i;
const STOREFRONT_MANIFEST = /(?:^|\/)storefront-manifest\.json$/i;
const RANDOM_ASSET = /\.(js|mjs|css|map|woff2?|png|jpe?g|webp|svg)$/i;

/**
 * Pick the primary artifact path to download for ingest.
 *
 * Prefer `storefront-build.tar.gz`, else a `storefront-manifest.json` companion
 * (incomplete alone — ingest will fail validation), else `null` for random assets.
 * Never treats `BUILD_BLOCKED.txt` as a ready artifact.
 */
export function pickArtifactPath(items: ArtifactListItem[] | null | undefined): string | null {
  if (!items || items.length === 0) return null;

  const usable = items.filter((i) => typeof i?.path === 'string' && i.path && !BUILD_BLOCKED.test(i.path));
  if (usable.length === 0) return null;

  const tar = usable.find((i) => STOREFRONT_TAR.test(i.path));
  if (tar) return tar.path;

  const manifest = usable.find((i) => STOREFRONT_MANIFEST.test(i.path));
  if (manifest) return manifest.path;

  // Explicitly refuse bare asset picks (legacy agent uploaded a single chunk).
  const onlyRandom =
    usable.length > 0 && usable.every((i) => RANDOM_ASSET.test(i.path) || i.path.includes('/assets/'));
  if (onlyRandom) return null;

  return null;
}

/** Companion manifest path for a chosen archive, if listed. */
export function findCompanionManifestPath(
  items: ArtifactListItem[] | null | undefined,
  archivePath: string,
): string | null {
  if (!items || !STOREFRONT_TAR.test(archivePath)) return null;
  const hit = items.find((i) => STOREFRONT_MANIFEST.test(i.path));
  return hit?.path ?? null;
}

export function isBuildBlockedArtifact(path: string): boolean {
  return BUILD_BLOCKED.test(path);
}

export function isStorefrontBuildArchive(path: string): boolean {
  return STOREFRONT_TAR.test(path);
}
