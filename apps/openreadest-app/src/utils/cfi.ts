import * as CFI from 'foliate-js/epubcfi.js';

export function isSameReadingAnchor(previous: string | undefined, current: string): boolean {
  if (previous === current) return true;
  if (!previous?.startsWith('epubcfi(') || !current.startsWith('epubcfi(')) return false;
  try {
    return CFI.collapse(previous) === CFI.collapse(current);
  } catch {
    return false;
  }
}

export function isCfiInLocation(cfi: string, location: string | null | undefined): boolean {
  if (!location) return false;

  const start = CFI.collapse(location);
  const end = CFI.collapse(location, true);

  return CFI.compare(cfi, start) >= 0 && CFI.compare(cfi, end) <= 0;
}
