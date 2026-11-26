import type { ViewSettings } from '@/types/book';

export const isVerticalPagination = (
  settings: Pick<ViewSettings, 'vertical' | 'writingMode'> | null | undefined,
) => Boolean(settings?.vertical) || Boolean(settings?.writingMode?.includes('vertical'));

/**
 * Vertical books lay their pages out along the block axis, so a horizontal
 * slide can never show the outgoing and the incoming page at the same moment:
 * the paginator slides the old page out, swaps while the screen holds nothing
 * but the page background, then slides the new page in from the other side.
 * That gap is the blank flash on vertical page turns.
 *
 * The paginator's layered turn (View Transitions) rasterizes the finished page
 * and slides it away over the already-rendered next page, so the turn stays
 * continuous. It only runs when the renderer carries a `turn-style`, which no
 * caller set before. E-ink screens and readers who turned the page animation
 * off keep the legacy paths (instant swap and the two-phase slide).
 */
export const getLayeredTurnStyle = (
  settings:
    | Pick<ViewSettings, 'vertical' | 'writingMode' | 'animated' | 'isEink'>
    | null
    | undefined,
) =>
  isVerticalPagination(settings) && Boolean(settings?.animated) && !settings?.isEink
    ? ('slide' as const)
    : null;
