import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeTTSClient } from '@/services/tts/NativeTTSClient';
import { TTSController } from '@/services/tts/TTSController';
import { TTSUtils } from '@/services/tts/TTSUtils';
import type { AppService } from '@/types/system';
import type { FoliateView } from '@/types/view';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: null as null | ((event: { payload: Record<string, unknown> }) => void),
  mobileListener: null as null | ((event: Record<string, unknown>) => void),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: native.invoke,
  addPluginListener: vi.fn(async (_plugin, _event, listener) => {
    native.mobileListener = listener;
    return { unregister: vi.fn() };
  }),
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
  native.mobileListener = null;
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

describe('Android native speech', () => {
  beforeEach(() => {
    native.invoke.mockImplementation(async (command) => {
      if (command.endsWith('|init')) return { success: true };
      if (command.endsWith('|get_all_voices')) {
        return {
          voices: [
            { id: 'pending', name: 'A (downloading)', lang: 'zh-CN', offline: false },
            { id: 'online', name: 'B (online)', lang: 'zh-CN', offline: false },
            { id: 'installed', name: 'C (offline)', lang: 'zh-CN', offline: true },
          ],
        };
      }
      if (command.endsWith('|speak')) {
        const utteranceId = 'android-utterance';
        native.mobileListener?.({ utteranceId, code: 'end' });
        return { utteranceId };
      }
      return undefined;
    });
  });

  it.each([
    [undefined, 'installed'],
    ['online', 'online'],
  ])('selects the expected voice given preference %s', async (preferredVoice, expectedVoice) => {
    if (preferredVoice) TTSUtils.setPreferredVoice('native-tts', 'zh', preferredVoice);
    const client = new NativeTTSClient();
    await client.init();
    const events = [];
    for await (const event of client.speakMark(
      { text: '你好', name: 'short', language: 'zh', offset: 0 },
      false,
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(client.getVoiceId()).toBe(expectedVoice);
    expect(events).toEqual([{ code: 'end', mark: 'short' }]);
  });

  it.each(['automatic', 'preferred', 'started'])(
    'retries only unplayed speech using automatic voice selection (%s)',
    async (mode) => {
      const mark = { text: '你好', name: 'short', language: 'zh', offset: 0 };
      let selected = '';
      const attempted: string[] = [];
      const invoke = native.invoke.getMockImplementation()!;
      native.invoke.mockImplementation(async (command, args) => {
        if (command.endsWith('|get_all_voices')) {
          return {
            voices: [
              { id: 'failing', name: 'A', lang: 'zh-CN', offline: true },
              { id: 'working', name: 'B', lang: 'zh-CN', offline: true },
            ],
          };
        }
        if (command.endsWith('|set_voice')) selected = args.payload.voice;
        if (command.endsWith('|speak')) {
          attempted.push(selected);
          const utteranceId = args.payload.utteranceId;
          if (mode === 'started') native.mobileListener?.({ utteranceId, code: 'boundary' });
          native.mobileListener?.({ utteranceId, code: selected === 'failing' ? 'error' : 'end' });
          return { utteranceId };
        }
        return invoke(command, args);
      });
      if (mode === 'preferred') TTSUtils.setPreferredVoice('native-tts', 'zh', 'failing');
      const client = new NativeTTSClient();
      await client.init();

      const events = [];
      for await (const event of client.speakMark(mark, false, new AbortController().signal)) {
        events.push(event.code);
      }
      if (mode === 'automatic') {
        expect(events).toEqual(['end']);
        for await (const _event of client.speakMark(mark, false, new AbortController().signal)) {
          // The next sentence should reuse the working voice.
        }
        expect(attempted).toEqual(['failing', 'working', 'working']);
      } else {
        expect(events).toEqual(mode === 'started' ? ['boundary', 'error'] : ['error']);
        expect(attempted).toEqual(['failing']);
      }
    },
  );

  it('leaves playback paused when the Android engine reports a synthesis error', async () => {
    const invoke = native.invoke.getMockImplementation()!;
    native.invoke.mockImplementation(async (command, args) => {
      if (command.endsWith('|speak')) {
        const utteranceId = args.payload.utteranceId;
        native.mobileListener?.({ utteranceId, code: 'error', message: 'Synthesis timed out' });
        return { utteranceId };
      }
      return invoke(command, args);
    });
    const controller = new TTSController({ isAndroidApp: true } as AppService, {} as FoliateView);
    vi.spyOn(controller, 'initViewTTS').mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await controller.init();
    const playbackError = vi.fn();
    controller.addEventListener('tts-playback-error', playbackError);
    await controller.speak('<speak xml:lang="zh"><mark name="a"/>你好。</speak>');

    await vi.waitFor(() => expect(playbackError).toHaveBeenCalledOnce());
    expect(controller.state).toBe('stop-paused');
    vi.restoreAllMocks();
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
