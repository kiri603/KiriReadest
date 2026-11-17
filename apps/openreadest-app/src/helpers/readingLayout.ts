import type { ViewSettings } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { useSettingsStore } from '@/store/settingsStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';

type ReadingLayout = Partial<Pick<ViewSettings, 'writingMode' | 'pageTurnDirection'>>;

export const saveReadingLayout = async (
  envConfig: EnvConfigType,
  bookKey: string,
  changes: ReadingLayout,
) => {
  const { settings, saveSettings, setSettings } = useSettingsStore.getState();
  const patch = changes.writingMode
    ? {
        ...changes,
        vertical: changes.writingMode.includes('vertical'),
        rtl: changes.writingMode.includes('rl'),
      }
    : changes;
  if (!bookKey) {
    const updated = {
      ...settings,
      globalViewSettings: { ...settings.globalViewSettings, ...patch },
    };
    await saveSettings(envConfig, updated);
    setSettings(updated);
    return;
  }
  const { getViewSettings, setViewSettings, recreateViewer } = useReaderStore.getState();
  const current = getViewSettings(bookKey);
  if (!current) throw new Error('Book view not found');
  const updated = { ...current, ...patch };
  const { getConfig, saveConfig } = useBookDataStore.getState();
  const config = getConfig(bookKey);
  if (config) await saveConfig(envConfig, bookKey, { ...config, viewSettings: updated }, settings);
  setViewSettings(bookKey, updated);
  if (changes.writingMode && changes.writingMode !== current.writingMode) {
    recreateViewer(envConfig, bookKey);
  }
};
