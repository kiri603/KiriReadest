import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  setSettings: vi.fn(),
  saveSettings: vi.fn(async () => {}),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {} }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      settings: store.settings,
      setSettings: store.setSettings,
      saveSettings: store.saveSettings,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/services/translators/ai', () => ({
  isAiConfigured: (settings?: { apiKey?: string } | null) => Boolean(settings?.apiKey?.trim()),
  listAiModels: vi.fn(),
  translateWordInContext: vi.fn(),
}));

import { listAiModels, translateWordInContext } from '@/services/translators/ai';
import AiTranslationPanel from '@/components/settings/AiTranslationPanel';

const apiKeyInput = () => screen.getByPlaceholderText('sk-...') as HTMLInputElement;
const endpointInput = () =>
  screen.getByPlaceholderText('https://api.deepseek.com') as HTMLInputElement;
const modelInput = () => screen.getByPlaceholderText('deepseek-chat') as HTMLInputElement;
const protocolSelect = () =>
  screen.getByRole('combobox', { name: 'API protocol' }) as HTMLSelectElement;

describe('AiTranslationPanel', () => {
  beforeEach(() => {
    cleanup();
    store.settings = {};
    store.setSettings.mockClear();
    store.saveSettings.mockClear();
    vi.mocked(translateWordInContext).mockReset();
    vi.mocked(listAiModels).mockReset();
  });

  it('lets the user type endpoint, key and model and saves them through the settings store', async () => {
    render(<AiTranslationPanel />);

    fireEvent.change(endpointInput(), { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(apiKeyInput(), { target: { value: 'sk-test' } });
    fireEvent.change(modelInput(), { target: { value: 'my-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledTimes(1));
    expect(store.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiTranslation: expect.objectContaining({
          enabled: true,
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          model: 'my-model',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
  });

  it('defaults to protocol auto-detect and does not persist a protocol field', async () => {
    render(<AiTranslationPanel />);

    expect(protocolSelect().value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledTimes(1));
    const [next] = vi.mocked(store.setSettings).mock.calls[0] ?? [];
    const saved = (next as { aiTranslation: Record<string, unknown> }).aiTranslation;
    expect(saved['protocol']).toBeUndefined();
  });

  it('saves an explicitly chosen Anthropic protocol and clears it back to auto', async () => {
    render(<AiTranslationPanel />);

    fireEvent.change(protocolSelect(), { target: { value: 'anthropic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledTimes(1));
    expect(store.setSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aiTranslation: expect.objectContaining({ protocol: 'anthropic' }),
      }),
    );

    fireEvent.change(protocolSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledTimes(2));
    const [next] = vi.mocked(store.setSettings).mock.calls[1] ?? [];
    const saved = (next as { aiTranslation: Record<string, unknown> }).aiTranslation;
    expect(saved['protocol']).toBeUndefined();
  });

  it('saves a custom output token budget and request timeout from the same panel', async () => {
    render(<AiTranslationPanel />);

    fireEvent.change(screen.getByPlaceholderText('600'), { target: { value: '4096' } });
    fireEvent.change(screen.getByPlaceholderText('20000'), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledTimes(1));
    expect(store.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiTranslation: expect.objectContaining({ maxTokens: 4096, timeoutMs: 60000 }),
      }),
    );
  });

  it('fills endpoint and model from the provider presets', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
    expect(endpointInput().value).toBe('https://api.deepseek.com');
    expect(modelInput().value).toBe('deepseek-chat');
    expect(protocolSelect().value).toBe('openai');

    fireEvent.click(screen.getByRole('button', { name: 'Ollama' }));
    expect(endpointInput().value).toBe('http://127.0.0.1:11434/v1');
    expect(modelInput().value).toBe('llama3.1');
    expect(protocolSelect().value).toBe('openai');
  });

  it('switches to the Anthropic protocol from its preset', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    expect(endpointInput().value).toBe('https://api.anthropic.com');
    expect(modelInput().value).toBe('claude-sonnet-4-5');
    expect(protocolSelect().value).toBe('anthropic');
  });

  it('asks for missing fields instead of calling the endpoint', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(screen.getByText('Fill in the endpoint, API key and model first.')).toBeTruthy();
    expect(vi.mocked(translateWordInContext)).not.toHaveBeenCalled();
  });

  it('reports the sense returned by the configured endpoint', async () => {
    vi.mocked(translateWordInContext).mockResolvedValue({ word: 'bank', meaning: '河岸' });
    render(<AiTranslationPanel />);

    fireEvent.change(apiKeyInput(), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => expect(translateWordInContext).toHaveBeenCalledTimes(1));
    const [request] = vi.mocked(translateWordInContext).mock.calls[0] ?? [];
    expect(request).toEqual(
      expect.objectContaining({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com' }),
    );
    expect(screen.getByText('Connected: 河岸')).toBeTruthy();
  });

  it('loads the models behind one key and lets the user pick from them', async () => {
    vi.mocked(listAiModels).mockResolvedValue(['deepseek-chat', 'deepseek-reasoner']);
    render(<AiTranslationPanel />);

    fireEvent.change(apiKeyInput(), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));

    await waitFor(() => expect(listAiModels).toHaveBeenCalledTimes(1));
    const [request] = vi.mocked(listAiModels).mock.calls[0] ?? [];
    expect(request).toEqual(
      expect.objectContaining({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com' }),
    );
    expect(screen.getByText('Models loaded: 2')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'deepseek-reasoner' })).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Model list' }), {
      target: { value: 'deepseek-reasoner' },
    });
    expect(modelInput().value).toBe('deepseek-reasoner');
  });

  it('asks for the key before fetching models', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    expect(screen.getByText('Fill in the endpoint and API key first.')).toBeTruthy();
    expect(vi.mocked(listAiModels)).not.toHaveBeenCalled();
  });
});
