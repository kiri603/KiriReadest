import type { Insets } from '@/types/misc';
import { getPopupPosition, type Position, type Rect } from '@/utils/sel';

export const getTranslatorPopupLayout = (
  anchor: Position,
  readerRect: Rect,
  insets: Insets,
  padding: number,
  hasContext: boolean,
) => {
  const safeRect = {
    left: readerRect.left + insets.left,
    right: readerRect.right - insets.right,
    top: readerRect.top + insets.top,
    bottom: readerRect.bottom - insets.bottom,
  };
  const width = Math.max(0, Math.min(480, safeRect.right - safeRect.left - 2 * padding));
  const height = Math.max(
    0,
    Math.min(hasContext ? 430 : 265, safeRect.bottom - safeRect.top - 2 * padding),
  );
  const position = getPopupPosition(
    { ...anchor, point: { x: anchor.point.x - insets.left, y: anchor.point.y - insets.top } },
    safeRect,
    width,
    height,
    padding,
  );
  position.point.x += insets.left;
  position.point.y += insets.top;

  const { x, y } = position.point;
  const { x: anchorX, y: anchorY } = anchor.point;
  const pointerFits = {
    up: y + height === anchorY && anchorX >= x && anchorX <= x + width,
    down: y >= anchorY + 6 && anchorX >= x && anchorX <= x + width,
    left: x + width === anchorX && anchorY >= y && anchorY <= y + height,
    right: x >= anchorX + 6 && anchorY >= y && anchorY <= y + height,
  };
  return {
    width,
    height,
    position,
    trianglePosition: anchor.dir && pointerFits[anchor.dir] ? anchor : undefined,
  };
};
