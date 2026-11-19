// @vitest-environment node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../src-tauri/src/macos/traffic_light.rs', import.meta.url)),
  'utf8',
).replace(/\s+/g, '');

it.each([
  'will-enter-fullscreen',
  'did-enter-fullscreen',
  'will-exit-fullscreen',
  'did-exit-fullscreen',
])('sends %s to the window that changed fullscreen state', (event) => {
  expect(source).toContain(
    `state.window.emit_to(EventTarget::window(state.window.label()),"${event}",`,
  );
  expect(source).not.toContain(`.emit("${event}",())`);
});
