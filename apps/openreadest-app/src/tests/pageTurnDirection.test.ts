import { describe, expect, it, vi } from 'vitest';
import { isPageTurnRtl, needsCustomSwipe } from '@/utils/pageTurnDirection';
import { viewPagination } from '@/app/reader/hooks/usePagination';
import type { ViewSettings } from '@/types/book';
import type { FoliateView } from '@/types/view';

vi.mock('@/context/EnvContext', () => ({ useEnv: vi.fn() }));
vi.mock('@/store/readerStore', () => ({ useReaderStore: vi.fn() }));
vi.mock('@/store/bookDataStore', () => ({ useBookDataStore: vi.fn() }));
vi.mock('@/store/deviceStore', () => ({ useDeviceControlStore: vi.fn() }));
vi.mock('@/utils/window', () => ({ tauriGetWindowLogicalPosition: vi.fn() }));

describe('page turn direction', () => {
  it('follows the text direction by default and allows either explicit direction', () => {
    expect(isPageTurnRtl({ rtl: true })).toBe(true);
    expect(isPageTurnRtl({ rtl: false })).toBe(false);
    expect(isPageTurnRtl({ rtl: true, pageTurnDirection: 'ltr' })).toBe(false);
    expect(isPageTurnRtl({ rtl: false, pageTurnDirection: 'rtl' })).toBe(true);
    expect(needsCustomSwipe({ rtl: true, pageTurnDirection: 'ltr' })).toBe(true);
    expect(needsCustomSwipe({ rtl: true, pageTurnDirection: 'auto' })).toBe(false);
  });

  it.each(['auto', 'rtl', 'ltr'] as const)(
    'maps left/right input for vertical text with %s preference',
    (pageTurnDirection) => {
      const next = vi.fn();
      const prev = vi.fn();
      const view = { renderer: { scrolled: false }, next, prev } as unknown as FoliateView;
      const settings = { rtl: true, pageTurnDirection } as ViewSettings;
      viewPagination(view, settings, 'left');
      expect(pageTurnDirection === 'ltr' ? prev : next).toHaveBeenCalledOnce();
      viewPagination(view, settings, 'right');
      expect(next).toHaveBeenCalledOnce();
      expect(prev).toHaveBeenCalledOnce();
    },
  );
});
