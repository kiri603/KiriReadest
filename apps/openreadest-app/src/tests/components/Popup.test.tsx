import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Popup from '@/components/Popup';
import type { Position } from '@/utils/sel';

// 这两个 hook 依赖全局 Provider / 设备信息，和弹窗尺寸计算无关
vi.mock('@/hooks/useKeyDownActions', () => ({ useKeyDownActions: () => {} }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));

// jsdom 没有 ResizeObserver，而 Popup 用它测量内容高度
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const container = () => document.getElementById('popup-container') as HTMLElement;

const renderPopup = (props: {
  trianglePosition: Position;
  minHeight?: number;
  maxHeight?: number;
  height?: number;
}) =>
  render(
    <Popup width={480} position={props.trianglePosition} {...props}>
      <div>content</div>
    </Popup>,
  );

describe('popup sizing within the visible area', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
    // 模拟一个 1032px 高的窗口；定位祖先就是视口本身
    Object.defineProperty(window, 'innerHeight', { value: 1032, configurable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('caps the height at the space above an upward triangle', () => {
    // 选区在 y=500，弹窗在它上方展开，只有 490px 可用
    renderPopup({ trianglePosition: { dir: 'up', point: { x: 100, y: 500 } }, height: 900 });
    const style = container().style;
    expect(parseFloat(style.maxHeight)).toBe(490);
    expect(parseFloat(style.height)).toBe(490);
  });

  it('never lets min-height win over the available height', () => {
    // 430 的 minHeight 在可用空间不足时必须被压下来，否则弹窗会撑出窗口被裁掉
    renderPopup({
      trianglePosition: { dir: 'up', point: { x: 100, y: 300 } },
      minHeight: 430,
    });
    const style = container().style;
    const maxHeight = parseFloat(style.maxHeight);
    expect(maxHeight).toBe(290);
    expect(parseFloat(style.minHeight)).toBeLessThanOrEqual(maxHeight);
  });

  it('uses the space below for a downward triangle', () => {
    renderPopup({
      trianglePosition: { dir: 'down', point: { x: 100, y: 800 } },
      minHeight: 430,
    });
    const style = container().style;
    const maxHeight = parseFloat(style.maxHeight);
    expect(maxHeight).toBe(222);
    expect(parseFloat(style.minHeight)).toBeLessThanOrEqual(maxHeight);
  });

  it('keeps a floor so a selection on the window edge still shows a usable popup', () => {
    renderPopup({ trianglePosition: { dir: 'down', point: { x: 100, y: 1030 } } });
    // 可用空间趋近 0 时保底 16 个 padding（160px）：至少要放得下标题行 + 一行内容 + 底部工具条，
    // 否则 footer 会被裁掉一半
    expect(parseFloat(container().style.maxHeight)).toBe(160);
  });

  it('clamps the requested height to the space below an downward triangle', () => {
    // 内容异步变高后调用方给的高度可能超过剩余空间，必须按 max-height 收进来
    renderPopup({ trianglePosition: { dir: 'down', point: { x: 100, y: 800 } }, height: 600 });
    const style = container().style;
    expect(parseFloat(style.maxHeight)).toBe(222);
    expect(parseFloat(style.height)).toBe(222);
  });
});
