import clsx from 'clsx';
import { Position } from '@/utils/sel';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useKeyDownActions } from '@/hooks/useKeyDownActions';

const getTriangleStyles = (
  trianglePosition: Position | undefined,
  size: number,
  offset: number,
): React.CSSProperties => {
  if (!trianglePosition) {
    return { left: '-999px', top: '-999px' };
  }

  const { dir, point } = trianglePosition;

  let topOffset = 0;
  let leftOffset = 0;
  switch (dir) {
    case 'up':
      topOffset = offset;
      break;
    case 'down':
      topOffset = -offset;
      break;
    case 'left':
      leftOffset = offset;
      break;
    case 'right':
      leftOffset = -offset;
      break;
  }

  return {
    left: `${point.x + leftOffset}px`,
    top: `${point.y + topOffset}px`,
    borderLeft:
      dir === 'right' ? 'none' : dir === 'left' ? `${size}px solid` : `${size}px solid transparent`,
    borderRight:
      dir === 'left' ? 'none' : dir === 'right' ? `${size}px solid` : `${size}px solid transparent`,
    borderTop:
      dir === 'down' ? 'none' : dir === 'up' ? `${size}px solid` : `${size}px solid transparent`,
    borderBottom:
      dir === 'up' ? 'none' : dir === 'down' ? `${size}px solid` : `${size}px solid transparent`,
    transform: dir === 'left' || dir === 'right' ? 'translateY(-50%)' : 'translateX(-50%)',
  };
};

const Popup = ({
  width,
  height,
  minHeight,
  maxHeight,
  position,
  trianglePosition,
  children,
  className = '',
  triangleClassName = '',
  additionalStyle = {},
  isOpen = true,
  onDismiss,
}: {
  isOpen?: boolean;
  width: number;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  position?: Position;
  trianglePosition?: Position;
  children: React.ReactNode;
  className?: string;
  triangleClassName?: string;
  additionalStyle?: React.CSSProperties;
  onDismiss?: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [childrenHeight, setChildrenHeight] = useState(height || minHeight || 0);
  // position/trianglePosition 是相对定位祖先（阅读区域的 grid cell）的坐标，
  // 而窗口高度是视口坐标。两者混用会让「下方」弹窗的可用高度多算一个工具栏的高度，
  // 弹窗于是撑出窗口底部被裁掉。这里量出定位祖先在视口中的位置，统一到它的坐标系里算。
  const [offsetRect, setOffsetRect] = useState({ top: 0, height: 0 });

  useKeyDownActions({ onCancel: onDismiss, elementRef: containerRef, enabled: isOpen });

  const popupPadding = useResponsiveSize(10);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const offsetParent = container.offsetParent as HTMLElement | null;
      const rect = (offsetParent ?? document.documentElement).getBoundingClientRect();
      // 定位祖先可能比视口更高（滚动布局），可见区域只到窗口底部
      const height = Math.min(rect.bottom, window.innerHeight) - rect.top;
      const next = { top: rect.top, height: Math.max(height, 0) };
      setOffsetRect((prev) => (prev.top === next.top && prev.height === next.height ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [position, trianglePosition]);

  const anchorY = trianglePosition?.point.y ?? 0;
  // offsetRect.height 为 0 表示还没量到（或者没有定位祖先），退回到整窗高度
  const boundingHeight = offsetRect.height || window.innerHeight - offsetRect.top;
  let availableHeight = boundingHeight - 2 * popupPadding;
  if (trianglePosition?.dir === 'up') {
    // 弹窗在选区上方展开，可用空间是选区上沿到阅读区域顶部的距离
    availableHeight = anchorY - popupPadding;
  } else if (trianglePosition?.dir === 'down') {
    // 弹窗在选区下方展开，可用空间是选区下沿到可见区域底部的距离
    availableHeight = boundingHeight - anchorY - popupPadding;
  }
  // 选区贴着窗口边缘时可用空间可能趋近于 0，留一个下限，避免弹窗被压成一条缝
  // （至少留出「标题栏 + 一行内容 + 底部工具条」的高度，否则 footer 会被裁掉一半）
  const boundedAvailableHeight = Math.max(availableHeight, popupPadding * 16);
  const boundedMaxHeight = Math.min(maxHeight || boundedAvailableHeight, boundedAvailableHeight);
  // min-height 一旦大于 max-height，CSS 会让 min-height 生效，弹窗就会撑出窗口被裁掉
  const boundedMinHeight = minHeight ? Math.min(minHeight, boundedMaxHeight) : undefined;

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        if (newHeight !== childrenHeight) {
          setChildrenHeight(newHeight);
          return;
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!position || !trianglePosition) {
      setAdjustedPosition(position);
      return;
    }
    // 还没量到内容高度时沿用调用方给的估算位置（getPopupPosition 已按估算高度摆好），
    // 否则第一帧会拿 0 当高度、把「向上」的弹窗整个压到选区下方闪一下。
    const containerHeight = childrenHeight || 0;
    if (!containerHeight) {
      setAdjustedPosition(position);
      return;
    }
    if (position.dir === 'up') {
      const newPosition = {
        ...position,
        point: {
          ...position.point,
          y: Math.max(popupPadding, trianglePosition.point.y - containerHeight),
        },
      };
      setAdjustedPosition(newPosition);
    } else if (position.dir === 'down') {
      // 下方弹窗内容变高（例如 AI 释义异步返回）时会越过窗口底部，
      // 这里按实测高度把弹窗整体上移，保证底边不超出可见区域。
      // 注意不能直接用 position.point.y：getPopupPosition 是按「估算高度」预先摆的，
      // 空间不足时它会先把弹窗往上推到压住选区；拿到实测高度后要重新贴回选区下方。
      const maxY = boundingHeight - popupPadding - containerHeight;
      const desiredY = Math.max(position.point.y, anchorY);
      const newPosition = {
        ...position,
        point: { ...position.point, y: Math.max(popupPadding, Math.min(desiredY, maxY)) },
      };
      setAdjustedPosition(newPosition);
    } else {
      setAdjustedPosition(position);
    }
  }, [position, trianglePosition, popupPadding, childrenHeight, boundingHeight, anchorY]);

  const outerTriangleStyles = getTriangleStyles(trianglePosition, 7, 0);
  const innerTriangleStyles = getTriangleStyles(trianglePosition, 7, -1);

  return (
    <div>
      <div
        className={clsx('popup-triangle-outer text-base-300 absolute z-50', triangleClassName)}
        style={outerTriangleStyles}
      />
      <div
        id='popup-container'
        ref={containerRef}
        className={clsx(
          'popup-container bg-base-300 absolute z-50 rounded-lg font-sans',
          'eink:border eink:border-base-content',
          trianglePosition?.dir !== 'up' && 'not-eink:shadow-xl',
          className,
        )}
        style={{
          width: `${width}px`,
          height: height ? `${Math.min(height, boundedMaxHeight)}px` : 'auto',
          minHeight: boundedMinHeight ? `${boundedMinHeight}px` : 'none',
          maxHeight: `${boundedMaxHeight}px`,
          left: `${adjustedPosition ? adjustedPosition.point.x : -999}px`,
          top: `${adjustedPosition ? adjustedPosition.point.y : -999}px`,
          ...additionalStyle,
        }}
      >
        {children}
      </div>
      <div
        className={clsx('popup-triangle-inner text-base-300 absolute z-50', triangleClassName)}
        style={innerTriangleStyles}
      />
    </div>
  );
};

export default Popup;
