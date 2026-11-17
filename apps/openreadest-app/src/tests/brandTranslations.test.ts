import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { applyOpenReadestTranslationOverrides } from '@/i18n/openreadestOverrides';

describe('KiriReadest translations', () => {
  it.each(['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja'])(
    '%s keeps the current brand when applied twice',
    async (lng) => {
      const instance = createInstance();
      await instance.init({
        lng,
        fallbackLng: false,
        keySeparator: false,
        resources: {
          [lng]: {
            translation: {
              'About Readest': 'About Readest',
              'Download Readest': 'Download Readest',
              'Exported from Readest': 'Exported from Readest',
            },
          },
        },
      });

      applyOpenReadestTranslationOverrides(instance, lng);
      applyOpenReadestTranslationOverrides(instance, lng);

      expect(instance.t('About KiriReadest')).toBe('About KiriReadest');
      expect(instance.t('Download KiriReadest')).toBe('Download KiriReadest');
      expect(instance.t('Exported from KiriReadest')).toBe('Exported from KiriReadest');
      expect(instance.getResourceBundle(lng, 'translation')['About KiriReadest']).toBeDefined();
      expect(
        instance.t('KiriReadest is independently maintained, based on OpenReadest and Readest.'),
      ).toContain('OpenReadest');
      expect(
        instance.t('KiriReadest is independently maintained, based on OpenReadest and Readest.'),
      ).toContain('Readest');
    },
  );
});
