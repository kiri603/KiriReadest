import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ContextMeaningCard from '@/app/reader/components/annotator/ContextMeaningCard';
import type { ContextMeaningState } from '@/hooks/useContextMeaning';
import type { SelectionContext } from '@/utils/translationContext';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const context: SelectionContext = {
  word: 'bank',
  sentence: 'He sat on the river bank.',
  previousSentence: '',
  paragraph: 'He sat on the river bank.',
};

const makeState = (overrides: Partial<ContextMeaningState> = {}): ContextMeaningState => ({
  loading: false,
  mode: null,
  wordMeaning: null,
  sentenceTranslation: null,
  contextTranslation: null,
  note: null,
  mainTranslation: null,
  error: null,
  aiConfigured: false,
  aiFailed: false,
  ...overrides,
});

const renderCard = (
  state: ContextMeaningState,
  {
    text = 'bank',
    selectionContext = context as SelectionContext | null,
    wordMode = true,
    onConfigureAi,
  }: {
    text?: string;
    selectionContext?: SelectionContext | null;
    wordMode?: boolean;
    onConfigureAi?: () => void;
  } = {},
) => {
  cleanup();
  return render(
    <ContextMeaningCard
      text={text}
      context={selectionContext}
      wordMode={wordMode}
      state={state}
      onConfigureAi={onConfigureAi}
    />,
  );
};

describe('ContextMeaningCard', () => {
  it('renders the AI sense of the word in context', () => {
    renderCard(
      makeState({
        mode: 'ai',
        aiConfigured: true,
        wordMeaning: {
          word: 'bank',
          reading: 'bæŋk',
          partOfSpeech: 'n.',
          meaning: '河岸',
          why: '与 river 搭配',
          sentenceTranslation: '他坐在河岸上。',
        },
      }),
    );

    expect(screen.getByText('Meaning in context')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText('河岸')).toBeTruthy();
    expect(screen.getByText('bæŋk')).toBeTruthy();
    expect(screen.getByText('n.')).toBeTruthy();
    expect(screen.getByText('与 river 搭配')).toBeTruthy();
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
  });

  it('shows the machine translation with a failure hint when AI failed', () => {
    const onConfigureAi = vi.fn();
    renderCard(
      makeState({
        mode: 'sentence',
        aiConfigured: true,
        aiFailed: true,
        sentenceTranslation: '他坐在河岸上。',
      }),
      { onConfigureAi },
    );

    expect(screen.getByText('Machine Translation')).toBeTruthy();
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
    expect(
      screen.getByText('AI request failed; showing machine translation instead.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Configure AI' }));
    expect(onConfigureAi).toHaveBeenCalledTimes(1);
  });

  it('shows the sentence translation and a configure hint when AI is not configured', () => {
    const onConfigureAi = vi.fn();
    renderCard(makeState({ mode: 'sentence', sentenceTranslation: '他坐在河岸上。' }), {
      onConfigureAi,
    });

    expect(screen.getByText('Machine Translation')).toBeTruthy();
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
    expect(
      screen.getByText(
        'Configure an AI service in Settings → Language to pin down the exact sense in this sentence.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Configure AI' }));
    expect(onConfigureAi).toHaveBeenCalledTimes(1);
  });

  it('renders the contextual translation and note in text mode', () => {
    renderCard(
      makeState({
        mode: 'ai',
        aiConfigured: true,
        contextTranslation: '他坐在河岸上。',
        note: 'bank 取河岸义',
      }),
      { text: 'He sat on the river bank.', wordMode: false },
    );

    expect(screen.getByText('Translation with context')).toBeTruthy();
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
    expect(screen.getByText('bank 取河岸义')).toBeTruthy();
  });

  it('renders nothing without a selection context', () => {
    const { container } = renderCard(makeState({ aiConfigured: true }), {
      selectionContext: null,
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a long selection when AI is not configured', () => {
    const { container } = renderCard(makeState({ sentenceTranslation: '译文' }), {
      text: 'He sat on the river bank.',
      wordMode: false,
    });

    expect(container.firstChild).toBeNull();
  });
});
