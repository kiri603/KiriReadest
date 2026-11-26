import type { SelectedFile } from '@/hooks/useFileSelector';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';
import type { AppService } from '@/types/system';
import { selectDirectory } from '@/utils/bridge';
import { getDirPath, getFilename, joinPaths } from '@/utils/path';

export interface FolderBook extends SelectedFile {
  relativePath: string;
}

export const canSelectBookFolder = (appService: AppService | null) =>
  !!appService &&
  (isTauriAppPlatform()
    ? appService.isAndroidApp || appService.canReadExternalDir
    : typeof HTMLInputElement !== 'undefined' && 'webkitdirectory' in HTMLInputElement.prototype);

const isBookFilename = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 && SUPPORTED_BOOK_EXTS.includes(filename.slice(dot + 1).toLowerCase());
};

const selectNativeBookFolder = async (appService: AppService): Promise<FolderBook[] | null> => {
  if (appService.isAndroidApp) {
    const result = await selectDirectory(SUPPORTED_BOOK_EXTS);
    if (result.error) throw new Error(result.error);
    if (result.cancelled) return null;
    if (!result.files) throw new Error('Android folder scan did not return files');
    return result.files.map(({ relativePath, uri }) => ({
      relativePath,
      path: uri,
      groupName: [result.directoryName, getDirPath(relativePath)].filter(Boolean).join('/'),
    }));
  }

  const directory = await appService.selectDirectory('read');
  if (!directory) return null;

  const root = getFilename(directory.replace(/[\\/]+$/, ''));
  const files = await appService.readDirectory(directory, 'None');
  return Promise.all(
    files
      .filter(({ path }) => isBookFilename(getFilename(path)))
      .map(async ({ path }) => ({
        relativePath: path,
        path: await joinPaths(directory, path),
        groupName: [root, getDirPath(path)].filter(Boolean).join('/'),
      })),
  );
};

const selectWebBookFolder = (): Promise<FolderBook[] | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const files = Array.from(input.files || []).filter((file) => isBookFilename(file.name));
      resolve(
        files.map((file) => ({
          file,
          relativePath: file.webkitRelativePath.slice(file.webkitRelativePath.indexOf('/') + 1),
          groupName: getDirPath(file.webkitRelativePath),
        })),
      );
    };
    input.click();
  });

export const selectBookFolder = async (appService: AppService): Promise<FolderBook[] | null> => {
  const books = await (isTauriAppPlatform()
    ? selectNativeBookFolder(appService)
    : selectWebBookFolder());
  return books?.sort((a, b) => a.relativePath.localeCompare(b.relativePath)) ?? null;
};
