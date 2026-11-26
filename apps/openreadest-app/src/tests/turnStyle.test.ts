import { describe, expect, it } from 'vitest';
import { getLayeredTurnStyle, isVerticalPagination } from '@/utils/turnStyle';

type TurnStyleInput = NonNullable<Parameters<typeof getLayeredTurnStyle>[0]>;

const settings = (overrides: Partial<TurnStyleInput> = {}): TurnStyleInput => ({
  vertical: false,
  writingMode: 'auto',
  animated: true,
  isEink: false,
  ...overrides,
});

describe('isVerticalPagination', () => {
  it('accepts the view setting and the writing mode', () => {
    expect(isVerticalPagination(settings({ vertical: true }))).toBe(true);
    expect(isVerticalPagination(settings({ writingMode: 'vertical-rl' }))).toBe(true);
  });

  it('rejects horizontal books and empty settings', () => {
    expect(isVerticalPagination(settings())).toBe(false);
    expect(isVerticalPagination(settings({ writingMode: 'horizontal-tb' }))).toBe(false);
    expect(isVerticalPagination(settings({ writingMode: 'horizontal-rl' }))).toBe(false);
    expect(isVerticalPagination(undefined)).toBe(false);
  });
});

describe('getLayeredTurnStyle', () => {
  it('uses the layered slide turn for animated vertical books', () => {
    expect(getLayeredTurnStyle(settings({ vertical: true }))).toBe('slide');
    expect(getLayeredTurnStyle(settings({ writingMode: 'vertical-rl' }))).toBe('slide');
  });

  it('leaves horizontal books on the scrolling animation', () => {
    expect(getLayeredTurnStyle(settings())).toBeNull();
  });

  it('keeps the legacy turn when animation is off or the screen is e-ink', () => {
    expect(getLayeredTurnStyle(settings({ vertical: true, animated: false }))).toBeNull();
    expect(getLayeredTurnStyle(settings({ vertical: true, isEink: true }))).toBeNull();
  });

  it('handles missing settings', () => {
    expect(getLayeredTurnStyle(undefined)).toBeNull();
  });
});
