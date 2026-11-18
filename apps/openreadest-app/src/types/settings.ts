import { CustomTheme } from '@/styles/themes';
import { CustomFont } from '@/styles/fonts';
import { CustomTexture } from '@/styles/textures';
import { HighlightColor, HighlightStyle, ViewSettings, WordNote, WordNoteTombstone } from './book';
import { OPDSCatalog } from './opds';
import type { ImportedDictionary } from '@/services/dictionaries/types';

export type ThemeType = 'light' | 'dark' | 'auto';
export type LibraryViewModeType = 'grid' | 'list';
export type LibrarySortByType =
  | 'title'
  | 'author'
  | 'updated'
  | 'created'
  | 'size'
  | 'format'
  | 'published';
export type LibraryCoverFitType = 'crop' | 'fit';

export type KOSyncChecksumMethod = 'binary' | 'filename';
export type KOSyncStrategy = 'prompt' | 'silent' | 'send' | 'receive';

export interface ReadSettings {
  sideBarWidth: string;
  isSideBarPinned: boolean;
  notebookWidth: string;
  isNotebookPinned: boolean;
  autohideCursor: boolean;
  translationProvider: string;
  translateTargetLang: string;

  highlightStyle: HighlightStyle;
  highlightStyles: Record<HighlightStyle, HighlightColor>;
  customHighlightColors: Record<HighlightColor, string>;
  customTtsHighlightColors: string[];
  customThemes: CustomTheme[];
}

export interface KOSyncSettings {
  enabled: boolean;
  serverUrl: string;
  username: string;
  userkey: string;
  deviceId: string;
  deviceName: string;
  checksumMethod: KOSyncChecksumMethod;
  strategy: KOSyncStrategy;
}

/**
 * 语境释义用的 AI 配置（OpenAI 兼容接口）。
 * 不限定厂商：DeepSeek / Kimi / 硅基流动 / OpenAI / 本地 Ollama 都填这里。
 */
export interface AiTranslationSettings {
  /** 关掉后即使用户填了 key 也不会请求 AI */
  enabled: boolean;
  /** 形如 https://api.deepseek.com 或 http://127.0.0.1:11434/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 请求超时（毫秒），未填按 20 秒 */
  timeoutMs?: number;
}

export interface SystemSettings {
  wordNotes?: WordNote[];
  wordNoteTombstones?: WordNoteTombstone[];
  aiTranslation?: AiTranslationSettings;
  version: number;
  localBooksDir: string;
  customRootDir?: string;

  keepLogin: boolean;
  autoUpload: boolean;
  alwaysOnTop: boolean;
  openBookInNewWindow: boolean;
  autoCheckUpdates: boolean;
  screenWakeLock: boolean;
  screenBrightness: number;
  autoScreenBrightness: boolean;
  alwaysShowStatusBar: boolean;
  alwaysInForeground: boolean;
  openLastBooks: boolean;
  lastOpenBooks: string[];
  autoImportBooksOnOpen: boolean;
  savedBookCoverForLockScreen: string;
  savedBookCoverForLockScreenPath: string;
  telemetryEnabled: boolean;
  discordRichPresenceEnabled: boolean;
  readingStatsEnabled: boolean;
  libraryViewMode: LibraryViewModeType;
  librarySortBy: LibrarySortByType;
  librarySortAscending: boolean;
  libraryCoverFit: LibraryCoverFitType;
  libraryAutoColumns: boolean;
  libraryColumns: number;
  customFonts: CustomFont[];
  customTextures: CustomTexture[];
  customDictionaries: ImportedDictionary[];
  opdsCatalogs: OPDSCatalog[];

  kosync: KOSyncSettings;

  lastSyncedAtBooks: number;
  lastSyncedAtConfigs: number;
  lastSyncedAtNotes: number;

  migrationVersion: number;

  globalReadSettings: ReadSettings;
  globalViewSettings: ViewSettings;
}
