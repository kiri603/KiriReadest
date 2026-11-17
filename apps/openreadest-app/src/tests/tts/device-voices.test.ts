import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTSController } from '@/services/tts/TTSController';
import { EdgeTTSClient } from '@/services/tts/EdgeTTSClient';
import { WebSpeechClient } from '@/services/tts/WebSpeechClient';
import type { FoliateView } from '@/types/view';

const edge = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/libs/edgeTTS', () => ({
  EdgeSpeechTTS: class {
    static voices = [{ id: 'en-US-AriaNeural', name: 'Aria', lang: 'en-US' }];
    create = edge.create;
  },
}));

beforeEach(() => {
  localStorage.clear();
  edge.create.mockReset().mockRejectedValue(new Error('Offline'));
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ voiceURI: 'local-zh', name: 'Local Chinese', lang: 'zh-CN' }],
    cancel: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('account-independent device speech', () => {
  it('uses device voices when logged out and Edge is unavailable', async () => {
    const controller = new TTSController(null, {} as FoliateView, false);
    const needAuth = vi.fn();
    controller.addEventListener('tts-need-auth', needAuth);
    await controller.init();
    expect(controller.ttsClient.name).toBe('web-speech');
    expect(controller.ttsWebVoices[0]?.disabled).toBe(false);
    expect(needAuth).not.toHaveBeenCalled();
    expect(edge.create).toHaveBeenCalledTimes(1);
  });

  it('prefers device voices even when Edge is available', async () => {
    edge.create.mockResolvedValue(new Response());
    const controller = new TTSController(null, {} as FoliateView);
    await controller.init();
    expect(controller.ttsClient.name).toBe('web-speech');
    expect(controller.ttsEdgeVoices[0]?.disabled).toBe(false);
  });

  it('finishes initialization when the online engine does not respond', async () => {
    vi.useFakeTimers();
    edge.create.mockReturnValue(new Promise(() => {}));
    const client = new EdgeTTSClient();
    const pending = client.init();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await Promise.race([pending, Promise.resolve('pending')])).toBe(false);
  });

  it('finishes initialization when the browser never supplies voices', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], onvoiceschanged: null });
    const client = new WebSpeechClient();
    const pending = client.init();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await Promise.race([pending, Promise.resolve('pending')])).toBe(false);
  });

  it('reports unavailable speech when neither device nor online voices can initialize', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const controller = new TTSController(null, {} as FoliateView);
    await expect(controller.init()).rejects.toThrow('No TTS engines are available');
  });
});
