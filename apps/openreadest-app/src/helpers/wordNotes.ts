import type { BookNote, WordNote } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { normalizeWord, upsertWordNote } from '@/utils/wordNotes';

const persistWordNotes = async (envConfig: EnvConfigType, wordNotes: WordNote[]) => {
  const { settings } = useSettingsStore.getState();
  const appService = await envConfig.getAppService();
  await appService.saveSettings({ ...settings, wordNotes });
  // Publish only after the write succeeds, so a failed save leaves the draft editable.
  useSettingsStore.getState().setSettings({
    ...useSettingsStore.getState().settings,
    wordNotes,
  });
};

export const saveWordNote = async (envConfig: EnvConfigType, word: string, content: string) => {
  const notes = upsertWordNote(useSettingsStore.getState().settings.wordNotes ?? [], word, content);
  await persistWordNotes(envConfig, notes);
  return notes.find((note) => note.word === normalizeWord(word))!;
};

export const removeWordNote = async (envConfig: EnvConfigType, id: string) => {
  const notes = useSettingsStore.getState().settings.wordNotes ?? [];
  if (notes.some((note) => note.id === id)) {
    await persistWordNotes(
      envConfig,
      notes.filter((note) => note.id !== id),
    );
  }
};

export const saveNoteScope = async (
  envConfig: EnvConfigType,
  annotation: BookNote,
  allBooks: boolean,
): Promise<BookNote> => {
  if (allBooks) {
    const shared = await saveWordNote(envConfig, annotation.text ?? '', annotation.note);
    return { ...annotation, wordNoteId: shared.id };
  }
  if (annotation.wordNoteId) await removeWordNote(envConfig, annotation.wordNoteId);
  return { ...annotation, wordNoteId: undefined };
};
