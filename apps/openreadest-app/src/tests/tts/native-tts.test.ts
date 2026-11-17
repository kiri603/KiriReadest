import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeTTSClient } from '@/services/tts/NativeTTSClient';
import { TTSController } from '@/services/tts/TTSController';
import type { AppService } from '@/types/system';
import type { FoliateView } from '@/types/view';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: null as null | ((event: { payload: Record<string, unknown> }) => void),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: native.invoke,
  addPluginListener: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name, listener) => {
    native.listener = listener;
    return vi.fn();
  }),
}));
vi.mock('@/libs/edgeTTS', () => ({
  EdgeSpeechTTS: class {
    static voices = [];
    create = vi.fn().mockRejectedValue(new Error('Offline'));
  },
}));

beforeEach(() => {
  localStorage.clear();
  native.listener = null;
  native.invoke.mockReset().mockImplementation(async (command, args) => {
    if (command.endsWith('|init')) return { success: true };
    if (command.endsWith('|get_all_voices')) {
      return { voices: [{ id: 'windows-zh', name: 'Huihui', lang: 'zh-CN' }] };
    }
    if (command.endsWith('|speak')) {
      const utteranceId = args.payload.utteranceId;
      // A very short utterance can finish before the IPC response arrives.
      native.listener?.({ payload: { utteranceId, code: 'end' } });
      return { utteranceId };
    }
    return undefined;
  });
});

describe('Windows native speech', () => {
  it('selects installed Windows voices with no WebView speech API', async () => {
    const controller = new TTSController(
      { isDesktopApp: true, osPlatform: 'windows' } as AppService,
      {} as FoliateView,
    );
    await controller.init();
    expect(controller.ttsClient.name).toBe('native-tts');
    expect(controller.ttsNativeVoices[0]?.lang).toBe('zh-CN');
  });

  it('delivers an end event even when it precedes the speak response', async () => {
    const client = new NativeTTSClient(undefined, true);
    await client.init();
    const events = [];
    for await (const event of client.speakMark(
      { text: '你好', name: 'short', language: 'zh', offset: 0 },
      false,
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events).toEqual([{ code: 'end', mark: 'short' }]);
  });

  it('unblocks a waiting utterance when stopped', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve));
    native.invoke.mockImplementation(async (command, args) => {
      if (command.endsWith('|init')) return { success: true };
      if (command.endsWith('|get_all_voices')) {
        return { voices: [{ id: 'windows-zh', name: 'Huihui', lang: 'zh-CN' }] };
      }
      if (command.endsWith('|speak')) {
        started();
        return { utteranceId: args.payload.utteranceId };
      }
      return undefined;
    });
    const client = new NativeTTSClient(undefined, true);
    await client.init();
    const iterator = client.speakMark(
      { text: '停止测试', name: 'stop', language: 'zh', offset: 0 },
      false,
      new AbortController().signal,
    );
    const pending = iterator.next();
    await ready;
    await client.stop();
    await expect(pending).resolves.toMatchObject({ value: { code: 'end' } });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });
});
