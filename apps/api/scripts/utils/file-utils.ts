import {
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface FileSystem {
  readdirSync: typeof readdirSync;
  statSync: typeof statSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
  existsSync: typeof existsSync;
  unlinkSync: typeof unlinkSync;
  readFileSync: typeof readFileSync;
  join: typeof join;
}

export const fs: FileSystem = {
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  join,
};

/**
 * 递归获取指定目录下所有的 DTO 文件
 */
export function getAllDtoFiles(dir: string, fileSystem: FileSystem = fs): string[] {
  let results: string[] = [];
  const list = fileSystem.readdirSync(dir);

  list.forEach((file: string) => {
    const filePath = fileSystem.join(dir, file);
    const stat = fileSystem.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getAllDtoFiles(filePath, fileSystem));
    } else if (file.endsWith('.dto.ts')) {
      results.push(filePath);
    }
  });

  return results;
}

/**
 * 确保目录存在，如果不存在则创建
 */
export function ensureDir(dir: string, fileSystem: FileSystem = fs): void {
  if (!fileSystem.existsSync(dir)) {
    fileSystem.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 安全删除文件
 */
export function safeDeleteFile(filePath: string, fileSystem: FileSystem = fs): boolean {
  if (fileSystem.existsSync(filePath)) {
    fileSystem.unlinkSync(filePath);
    return true;
  }
  return false;
}
