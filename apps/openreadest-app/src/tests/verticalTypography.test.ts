// @vitest-environment jsdom
import * as CFI from 'foliate-js/epubcfi.js';
import { applyVerticalTypography } from '@/utils/verticalTypography';
import { describe, expect, it } from 'vitest';

const setup = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
};

describe('applyVerticalTypography', () => {
  it('sets short numbers and initials upright without splitting longer English or numbers', () => {
    const sample =
      '1. 第１２話、AIとA、I am reading an e-book、I’m here、2026年、12.34、10,000円、A12';
    const container = setup(`<p style="writing-mode:vertical-rl">${sample}</p>`);

    try {
      applyVerticalTypography(container);
      applyVerticalTypography(container);

      expect([...container.querySelectorAll('[cfi-skip]')].map((el) => el.textContent)).toEqual([
        '1',
        '１２',
        'AI',
        'A',
      ]);
      expect(container.textContent).toBe(sample);
    } finally {
      container.remove();
    }
  });

  it('keeps horizontal text, existing vertical composition, ruby readings, and code intact', () => {
    const container = setup(`
      <p style="writing-mode:horizontal-tb">12 English</p>
      <p style="writing-mode:vertical-rl;text-combine-upright:all">12</p>
      <rt style="writing-mode:vertical-rl">12</rt><code style="writing-mode:vertical-rl">12</code>
    `);

    try {
      applyVerticalTypography(container);
      expect(container.querySelector('[cfi-skip]')).toBeNull();
    } finally {
      container.remove();
    }
  });

  it('preserves reading positions and annotation offsets across inserted spans', () => {
    const container = setup('<p style="writing-mode:vertical-rl">第12話。English</p>');
    const paragraph = container.querySelector('p')!;
    const original = document.createRange();
    original.setStart(paragraph.firstChild!, 1);
    original.setEnd(paragraph.firstChild!, 5);
    const locator = CFI.fromRange(original);

    try {
      applyVerticalTypography(container);
      const restored = CFI.toRange(document, CFI.parse(locator))!;
      expect(restored.toString()).toBe('12話。');
      expect(CFI.fromRange(restored)).toBe(locator);
      const insideNumber = document.createRange();
      const number = paragraph.querySelector('[cfi-skip]')!.firstChild!;
      insideNumber.setStart(number, 0);
      insideNumber.setEnd(number, 2);
      expect(CFI.toRange(document, CFI.parse(CFI.fromRange(insideNumber)))?.toString()).toBe('12');
    } finally {
      container.remove();
    }
  });
});
