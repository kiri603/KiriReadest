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
        aiTranslation: {
          enabled: true,
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          model: 'my-model',
        },
      }),
    );
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
  });

  it('fills endpoint and model from the provider presets', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
    expect(endpointInput().value).toBe('https://api.deepseek.com');
    expect(modelInput().value).toBe('deepseek-chat');

    fireEvent.click(screen.getByRole('button', { name: 'Ollama' }));
    expect(endpointInput().value).toBe('http://127.0.0.1:11434/v1');
    expect(modelInput().value).toBe('llama3.1');
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

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'deepseek-reasoner' } });
    expect(modelInput().value).toBe('deepseek-reasoner');
  });

  it('asks for the key before fetching models', () => {
    render(<AiTranslationPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    expect(screen.getByText('Fill in the endpoint and API key first.')).toBeTruthy();
    expect(vi.mocked(listAiModels)).not.toHaveBeenCalled();
  });
});
