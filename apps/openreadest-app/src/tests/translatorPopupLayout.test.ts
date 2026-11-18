import { describe, expect, it } from 'vitest';
import { getTranslatorPopupLayout } from '@/app/reader/utils/translatorPopupLayout';

const phone = { left: 0, right: 360, top: 0, bottom: 792 };
const insets = { top: 24, right: 0, bottom: 28, left: 0 };

describe('getTranslatorPopupLayout', () => {
  it('keeps the entire translation inside the safe area for a low vertical selection', () => {
    const anchor = { point: { x: 92, y: 730 }, dir: 'right' } as const;
    const layout = getTranslatorPopupLayout(anchor, phone, insets, 12, true);

    expect(layout).toMatchObject({ width: 336, height: 430 });
    expect(layout.position.point).toEqual({ x: 12, y: 322 });
    expect(layout.trianglePosition).toBeUndefined();
  });

  it('uses the available width and height of a short split reader pane', () => {
    const rect = { left: 200, right: 560, top: 300, bottom: 540 };
    const anchor = { point: { x: 180, y: 124 }, dir: 'down' } as const;
    const layout = getTranslatorPopupLayout(anchor, rect, insets, 12, true);

    expect(layout).toMatchObject({ width: 336, height: 164 });
    expect(layout.position.point).toEqual({ x: 12, y: 36 });
    expect(layout.trianglePosition).toBeUndefined();
  });

  it('retains the pointer when the popup can stay beside the selection', () => {
    const rect = { left: 0, right: 1000, top: 0, bottom: 800 };
    const anchor = { point: { x: 300, y: 400 }, dir: 'right' } as const;
    const layout = getTranslatorPopupLayout(anchor, rect, insets, 10, false);

    expect(layout.position.point.x).toBe(306);
    expect(layout.trianglePosition).toEqual(anchor);
  });
});
