import type { ViewSettings } from '@/types/book';

export const isPageTurnRtl = (
  settings: Pick<ViewSettings, 'rtl' | 'pageTurnDirection'> | null | undefined,
) =>
  settings?.pageTurnDirection === 'rtl' ||
  (settings?.pageTurnDirection !== 'ltr' && Boolean(settings?.rtl));

export const needsCustomSwipe = (
  settings: Pick<ViewSettings, 'rtl' | 'pageTurnDirection'> | null | undefined,
) => isPageTurnRtl(settings) !== Boolean(settings?.rtl);
