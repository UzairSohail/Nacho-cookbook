import { describe, expect, it } from 'vitest';

import { buildFromTag, formatMb, isNewer, parseBuild, parseLatestRelease } from '../appUpdate';

const release = {
  tag_name: 'test-build-57',
  name: 'Test build 57',
  assets: [
    { name: 'other.txt', browser_download_url: 'https://example.com/other.txt', size: 3 },
    {
      name: 'nacho-cookbook.apk',
      browser_download_url: 'https://github.com/UzairSohail/Nacho-cookbook/releases/download/test-build-57/nacho-cookbook.apk',
      size: 61_400_000,
    },
  ],
};

describe('app update check', () => {
  it('reads the build number from the release tag', () => {
    expect(buildFromTag('test-build-57')).toBe(57);
    expect(buildFromTag('v1.0.0')).toBeNull();
    expect(buildFromTag(undefined)).toBeNull();
  });

  it('parses the latest release and its APK', () => {
    expect(parseLatestRelease(release)).toEqual({
      build: 57,
      name: 'Test build 57',
      apkUrl: 'https://github.com/UzairSohail/Nacho-cookbook/releases/download/test-build-57/nacho-cookbook.apk',
      apkSize: 61_400_000,
    });
  });

  it('ignores a release without the APK yet', () => {
    expect(parseLatestRelease({ ...release, assets: [] })).toBeNull();
    expect(parseLatestRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });

  it('only offers a strictly newer build', () => {
    const latest = parseLatestRelease(release);
    expect(isNewer(latest, 56)).toBe(true);
    expect(isNewer(latest, 57)).toBe(false);
    expect(isNewer(latest, 60)).toBe(false);
    expect(isNewer(latest, null)).toBe(false);
    expect(isNewer(null, 1)).toBe(false);
  });

  it('parses the installed version code', () => {
    expect(parseBuild('56')).toBe(56);
    expect(parseBuild(56)).toBe(56);
    expect(parseBuild(null)).toBeNull();
    expect(parseBuild('1.0.0')).toBeNull();
  });

  it('formats the download size', () => {
    expect(formatMb(61_400_000)).toBe('61 MB');
    expect(formatMb(null)).toBe('');
  });
});
