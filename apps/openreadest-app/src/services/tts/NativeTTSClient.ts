import { invoke } from '@tauri-apps/api/core';
import { addPluginListener, PluginListener } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getUserLocale } from '@/utils/misc';
import { parseSSMLMarks } from '@/utils/ssml';
import { stubTranslation as _ } from '@/utils/misc';
import { TTSClient, TTSMessageEvent } from './TTSClient';
import { TTSGranularity, TTSMark, TTSVoice, TTSVoicesGroup } from './types';
import { TTSUtils } from './TTSUtils';
import { TTSController } from './TTSController';

type TTSEventPayload = {
  utteranceId: string;
} & TTSMessageEvent;

const TTSEngines = {
  default: 'System TTS',
  msctts: 'Msc TTS',
  mstrans: 'MSTrans TTS',
  microsoft: 'Microsoft TTS',
  bytedance: 'ByteDance TTS',
  peiyinya: 'PeiYinYa TTS',
  huoshan: 'HuoShan TTS',
  sougou: 'Sougou TTS',
  xiaomi: 'XiaoMi TTS',
  bdetts: 'BDeTTS',
  bdotts: 'BDoTTS',
  vcstts: 'VcsTTS',
  isstts: 'IssTTS',
  xfpeiyin: 'XFPeiYin',
  azure: 'Azure TTS',
  edgetts: 'Edge TTS',
  google: 'Google TTS',
  gemini: 'Gemini TTS',
  weread: 'WeRead TTS',
  aispeech: 'Aispeech',
} as Record<string, string>;

const MAX_AUTOMATIC_VOICE_ATTEMPTS = 3;

export class NativeTTSClient implements TTSClient {
  name = 'native-tts';
  initialized = false;
  controller?: TTSController;

  #voices: TTSVoice[] = [];
  #primaryLang = 'en';
  #speakingLang = '';
  #currentVoiceId = '';
  #rate = 1.0;
  #pitch = 1.0;
  #workingVoices = new Map<string, string>();

  #eventListener: PluginListener | UnlistenFn | null = null;
  #starting = false;
  #earlyEvents = new Map<string, TTSMessageEvent[]>();
  #activeUtterances = new Map<
    string,
    {
      eventQueue: TTSMessageEvent[];
      resolver: (() => void) | null;
      finished: boolean;
    }
  >();

  constructor(
    controller?: TTSController,
    private windowsNative = false,
  ) {
    this.controller = controller;
  }

  private async setupEventListener(): Promise<void> {
    if (this.#eventListener) return;
    const receive = ({ utteranceId, code, message, mark }: TTSEventPayload) => {
      const event: TTSMessageEvent = { code, message, mark };
      const data = this.#activeUtterances.get(utteranceId);
      if (!data) {
        if (this.#starting && !this.windowsNative) {
          const events = this.#earlyEvents.get(utteranceId) ?? [];
          events.push(event);
          this.#earlyEvents.set(utteranceId, events);
        }
        return;
      }
      data.eventQueue.push(event);
      if (code === 'end' || code === 'error') data.finished = true;
      data.resolver?.();
      data.resolver = null;
    };
    this.#eventListener = this.windowsNative
      ? await listen<TTSEventPayload>('native-tts-events', (event) => receive(event.payload))
      : await addPluginListener<TTSEventPayload>('native-tts', 'tts_events', receive);
  }

  async init(): Promise<boolean> {
    const result = await invoke<{ success: boolean }>('plugin:native-tts|init');
    this.initialized = result.success;
    if (this.initialized) {
      await this.setupEventListener();
    }
    return this.initialized;
  }

  async *speakMark(mark: TTSMark, preload: boolean, signal: AbortSignal) {
    if (preload) {
      yield { code: 'end', message: 'Dummy preload finished' } as TTSMessageEvent;
      return;
    }
    if (signal.aborted) return;
    const { language } = mark;
    const voiceIds = await this.#getVoiceCandidates(language);
    if (this.windowsNative && !voiceIds[0]) {
      throw new Error(`No installed Windows voice for ${language}`);
    }
    this.#speakingLang = language;
    for (const [index, voiceId] of voiceIds.entries()) {
      if (signal.aborted) return;
      let started = false;
      for await (const event of this.#speakWithVoice(mark, voiceId, signal)) {
        if (event.code === 'boundary') started = true;
        if (event.code === 'error' && !started && index + 1 < voiceIds.length) break;
        if (event.code === 'end' && voiceIds.length > 1) {
          this.#workingVoices.set(language, voiceId);
        }
        yield event;
        if (event.code === 'end' || event.code === 'error') return;
      }
    }
  }

  async *#speakWithVoice(mark: TTSMark, voiceId: string, signal: AbortSignal) {
    await this.setVoice(voiceId);
    let utteranceId = crypto.randomUUID();
    const data = {
      eventQueue: [] as TTSMessageEvent[],
      resolver: null as (() => void) | null,
      finished: false,
    };
    this.#activeUtterances.set(utteranceId, data);
    const abortHandler = () => {
      void this.stop().catch((error) => console.error('Failed to stop speech:', error));
    };
    signal.addEventListener('abort', abortHandler);
    try {
      if (signal.aborted) return;
      this.#starting = true;
      const result = await invoke<{ utteranceId: string }>('plugin:native-tts|speak', {
        payload: { text: mark.text, preload: false, utteranceId },
      });
      if (result.utteranceId !== utteranceId) {
        this.#activeUtterances.delete(utteranceId);
        utteranceId = result.utteranceId;
        this.#activeUtterances.set(utteranceId, data);
        data.eventQueue.push(...(this.#earlyEvents.get(utteranceId) ?? []));
      }
      this.#starting = false;
      this.#earlyEvents.clear();
      while (!signal.aborted) {
        const event = data.eventQueue.shift();
        if (event) {
          yield { ...event, mark: mark.name };
          if (event.code === 'end' || event.code === 'error') break;
        } else if (data.finished) {
          break;
        } else {
          await new Promise<void>((resolve) => {
            data.resolver = resolve;
          });
        }
      }
    } finally {
      this.#starting = false;
      this.#earlyEvents.clear();
      signal.removeEventListener('abort', abortHandler);
      this.#activeUtterances.delete(utteranceId);
    }
  }

  async *speak(ssml: string, signal: AbortSignal, preload: boolean = false) {
    const { marks } = parseSSMLMarks(ssml, this.#primaryLang);

    for (const mark of marks) {
      this.controller?.dispatchSpeakMark(mark);
      for await (const ev of this.speakMark(mark, preload, signal)) {
        if (signal.aborted) {
          yield { code: 'error', message: 'Aborted' } as TTSMessageEvent;
          return;
        }
        yield ev;
      }
    }
  }

  async #getVoiceCandidates(lang: string) {
    const preferredVoiceId = TTSUtils.getPreferredVoice(this.name, lang);
    const voices = await this.getAllVoices();
    const preferredVoice = voices.find((voice) => voice.id === preferredVoiceId);
    if (preferredVoice) return [preferredVoice.id];

    const groups = await this.getVoices(lang);
    const defaultVoiceId = groups[0]?.voices[0]?.id ?? '';
    if (this.windowsNative) return [defaultVoiceId];

    const offlineIds = groups.flatMap((group) =>
      group.voices.filter((voice) => voice.offline && !voice.disabled).map((voice) => voice.id),
    );
    if (offlineIds.length === 0) return [defaultVoiceId];

    const workingId = this.#workingVoices.get(lang);
    if (workingId && offlineIds.includes(workingId)) {
      return [workingId, ...offlineIds.filter((id) => id !== workingId)].slice(
        0,
        MAX_AUTOMATIC_VOICE_ATTEMPTS,
      );
    }
    return offlineIds.slice(0, MAX_AUTOMATIC_VOICE_ATTEMPTS);
  }

  async pause() {
    await invoke('plugin:native-tts|pause');
    return this.windowsNative;
  }

  async resume() {
    // No-op for Android TextToSpeech
    await invoke('plugin:native-tts|resume');
    return this.windowsNative;
  }

  async stop() {
    await invoke('plugin:native-tts|stop');
    for (const data of this.#activeUtterances.values()) {
      data.finished = true;
      data.eventQueue.push({ code: 'end' });
      data.resolver?.();
      data.resolver = null;
    }
  }

  async setRate(rate: number) {
    // Power the rate to match the EdgeTTS behavior
    this.#rate = this.windowsNative ? rate : parseFloat(Math.pow(rate, 2.5).toFixed(2));
    await invoke('plugin:native-tts|set_rate', { payload: { rate: this.#rate } });
  }

  async setPitch(pitch: number) {
    this.#pitch = pitch;
    await invoke('plugin:native-tts|set_pitch', { payload: { pitch: this.#pitch } });
  }

  async setVoice(voice: string) {
    this.#currentVoiceId = voice;
    await invoke('plugin:native-tts|set_voice', { payload: { voice } });
  }

  async getAllVoices() {
    if (this.#voices.length > 0) {
      return this.#voices;
    }
    try {
      const result = await invoke<{ voices: TTSVoice[] }>('plugin:native-tts|get_all_voices');
      this.#voices = result.voices;
      return this.#voices;
    } catch (error) {
      console.error('Failed to get all voices:', error);
      return [];
    }
  }

  async getVoices(lang: string) {
    const locale = lang === 'en' ? getUserLocale(lang) || lang : lang;
    const voices = await this.getAllVoices();
    const filteredVoices = voices.filter(
      (v) => v.lang.startsWith(locale) || (lang === 'en' && ['en-US', 'en-GB'].includes(v.lang)),
    );
    const voiceGroups = new Map<string, TTSVoice[]>();
    filteredVoices.forEach((voice) => {
      const { name, lang } = voice;
      let groupId = voice.id.split('_')[0]!;
      if (groupId in TTSEngines) {
        voice.name = name
          .replace(`${groupId}_`, '')
          .replace(`${lang}-`, '')
          .replace('Neural', '')
          .trim();
      } else {
        groupId = 'default';
      }
      voice.name = voice.name.replace('NOT_SET', _('Default'));
      if (!voiceGroups.has(groupId)) {
        voiceGroups.set(groupId, []);
      }
      voiceGroups.get(groupId)!.push(voice);
    });

    return Array.from(voiceGroups.entries())
      .map(
        ([groupId, voices]) =>
          ({
            id: groupId,
            name: TTSEngines[groupId] || groupId,
            voices: voices.sort(TTSUtils.sortVoicesFunc),
            disabled: !this.initialized || voices.length === 0,
          }) as TTSVoicesGroup,
      )
      .sort((a, b) => {
        if (a.id === 'default') return -1;
        if (b.id === 'default') return 1;
        return a.id.localeCompare(b.id);
      });
  }

  setPrimaryLang(lang: string) {
    this.#primaryLang = lang;
  }

  getGranularities(): TTSGranularity[] {
    return ['sentence'];
  }

  getVoiceId() {
    return this.#currentVoiceId;
  }

  getSpeakingLang() {
    return this.#speakingLang;
  }

  async shutdown() {
    await this.stop();
    if (this.#eventListener) {
      if (typeof this.#eventListener === 'function') this.#eventListener();
      else await this.#eventListener.unregister();
      this.#eventListener = null;
    }
    this.initialized = false;
  }
}
