import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import { getTranslators } from '@/services/translators/providers';
import { googleProvider } from '@/services/translators/providers/google';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: vi.fn() }));
vi.mock('@/utils/misc', () => ({ stubTranslation: (key: string) => key }));

const translatedResponse = () => Response.json([[['地方', '場所']]]);

describe('Google Translate', () => {
  const browserFetch = vi.fn<typeof fetch>();
  const nativeFetch = vi.mocked(tauriFetch);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', browserFetch);
    vi.mocked(isTauriAppPlatform).mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is the only translation provider', () => {
    expect(getTranslators().map((provider) => provider.name)).toEqual(['google']);
  });

  it('translates in the webview without needing the native client', async () => {
    browserFetch.mockResolvedValue(translatedResponse());

    await expect(googleProvider.translate(['場所', ''], 'AUTO', 'zh-CN')).resolves.toEqual([
      '地方',
      '',
    ]);
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('tries the same Google endpoint natively when the webview cannot connect', async () => {
    browserFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    nativeFetch.mockResolvedValue(translatedResponse());

    await expect(googleProvider.translate(['場所'], 'AUTO', 'zh-CN')).resolves.toEqual(['地方']);
    expect(nativeFetch.mock.calls[0]?.[0]).toBe(browserFetch.mock.calls[0]?.[0]);
  });

  it('surfaces HTTP errors without retrying them in the native client', async () => {
    browserFetch.mockResolvedValue(new Response(null, { status: 429 }));

    await expect(googleProvider.translate(['場所'], 'AUTO', 'zh-CN')).rejects.toThrow('429');
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('uses only browser fetch on the web', async () => {
    vi.mocked(isTauriAppPlatform).mockReturnValue(false);
    browserFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(googleProvider.translate(['場所'], 'AUTO', 'zh-CN')).rejects.toThrow(
      'Failed to fetch',
    );
    expect(nativeFetch).not.toHaveBeenCalled();
  });
});
