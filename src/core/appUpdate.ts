/**
 * Pure helpers for the Android "new version available" check. Each merge to
 * master publishes one GitHub release tagged `test-build-N`, and the APK in it
 * has version code N, so comparing N with the installed version code tells us
 * whether there's something newer to install.
 */

export const RELEASES_API = 'https://api.github.com/repos/UzairSohail/Nacho-cookbook/releases/latest';
export const APK_NAME = 'nacho-cookbook.apk';
export const APK_FALLBACK_URL = `https://github.com/UzairSohail/Nacho-cookbook/releases/latest/download/${APK_NAME}`;

export type LatestRelease = {
  build: number;
  name: string;
  apkUrl: string;
  apkSize: number | null;
};

/** `test-build-42` → 42; anything else → null. */
export function buildFromTag(tag: unknown): number | null {
  if (typeof tag !== 'string') return null;
  const m = /^test-build-(\d+)$/.exec(tag.trim());
  return m ? Number(m[1]) : null;
}

/** Reads the parts we need from GitHub's "latest release" JSON. */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; name?: unknown; assets?: unknown };
  const build = buildFromTag(r.tag_name);
  if (build == null) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as Array<Record<string, unknown>>) : [];
  const apk = assets.find((a) => a.name === APK_NAME);
  const apkUrl = typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : null;
  if (!apkUrl) return null; // Release still uploading, or no APK attached.
  return {
    build,
    name: typeof r.name === 'string' && r.name ? r.name : `Test build ${build}`,
    apkUrl,
    apkSize: typeof apk?.size === 'number' ? apk.size : null,
  };
}

/** Installed version code as a number, or null when unknown (web, dev builds). */
export function parseBuild(versionCode: string | number | null | undefined): number | null {
  const n = typeof versionCode === 'number' ? versionCode : Number(versionCode);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function isNewer(latest: LatestRelease | null, installed: number | null): boolean {
  return latest != null && installed != null && latest.build > installed;
}

export function formatMb(bytes: number | null): string {
  return bytes == null ? '' : `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}
