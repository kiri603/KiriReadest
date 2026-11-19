import { join } from '@tauri-apps/api/path';
import { isContentURI, isFileURI, isValidURL } from './misc';

export const getFilename = (fileOrUri: string) => {
  const isUri = isValidURL(fileOrUri) || isContentURI(fileOrUri) || isFileURI(fileOrUri);
  const path = isUri ? decodeURI(fileOrUri) : fileOrUri;
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const lastPart = parts.pop()!;
  return isUri ? lastPart.split('?')[0]! : lastPart;
};

export const getBaseFilename = (filename: string) => {
  const normalizedPath = filename.replace(/\\/g, '/');
  const name = normalizedPath.split('/').pop() || '';

  const parts = name.split('.');
  if (parts.length <= 1) {
    return name;
  }

  return parts.slice(0, -1).join('.');
};

export const getDirPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  parts.pop();
  return parts.join('/');
};

export const joinPaths = async (...paths: string[]) => {
  return await join(...paths);
};
