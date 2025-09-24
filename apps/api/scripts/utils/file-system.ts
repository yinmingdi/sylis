import {
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { FileSystemInterface } from '../types';
import { logger } from './logger';

/**
 * 文件系统操作工具类
 */
export class FileSystemManager implements FileSystemInterface {
  readdirSync = readdirSync;
  statSync = statSync;
  writeFileSync = writeFileSync;
  mkdirSync = mkdirSync;
  existsSync = existsSync;
  unlinkSync = unlinkSync;
  readFileSync = readFileSync;
  join = join;

  /**
   * 递归获取指定目录下所有的 DTO 文件
   */
  getAllDtoFiles(dir: string): string[] {
    if (!this.existsSync(dir)) {
      logger.warn(`Directory does not exist: ${dir}`);
      return [];
    }

    let results: string[] = [];

    try {
      const list = this.readdirSync(dir);

      list.forEach((file: string) => {
        const filePath = this.join(dir, file);
        const stat = this.statSync(filePath);

        if (stat.isDirectory()) {
          results = results.concat(this.getAllDtoFiles(filePath));
        } else if (file.endsWith('.dto.ts')) {
          results.push(filePath);
        }
      });
    } catch (error) {
      logger.error(`Failed to read directory ${dir}:`, error);
    }

    return results;
  }

  /**
   * 确保目录存在，如果不存在则创建
   */
  ensureDir(dir: string): void {
    if (!this.existsSync(dir)) {
      try {
        this.mkdirSync(dir, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      } catch (error) {
        logger.error(`Failed to create directory ${dir}:`, error);
        throw error;
      }
    }
  }

  /**
   * 安全删除文件
   */
  safeDeleteFile(filePath: string): boolean {
    if (this.existsSync(filePath)) {
      try {
        this.unlinkSync(filePath);
        logger.debug(`Deleted file: ${filePath}`);
        return true;
      } catch (error) {
        logger.error(`Failed to delete file ${filePath}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * 递归删除目录
   */
  removeDirectory(dirPath: string): void {
    if (this.existsSync(dirPath)) {
      try {
        rmSync(dirPath, { recursive: true, force: true });
        logger.debug(`Removed directory: ${dirPath}`);
      } catch (error) {
        logger.error(`Failed to remove directory ${dirPath}:`, error);
        throw error;
      }
    }
  }

  /**
   * 写入文件，自动创建目录
   */
  writeFileWithDir(filePath: string, content: string): void {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    this.ensureDir(dir);

    try {
      this.writeFileSync(filePath, content, 'utf-8');
      logger.debug(`Written file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to write file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * 安全读取文件
   */
  safeReadFile(filePath: string): string | null {
    if (!this.existsSync(filePath)) {
      return null;
    }

    try {
      return this.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to read file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 获取目录中的子目录
   */
  getSubDirectories(dir: string): string[] {
    if (!this.existsSync(dir)) {
      return [];
    }

    try {
      return this.readdirSync(dir).filter((item) => {
        const itemPath = this.join(dir, item);
        return this.statSync(itemPath).isDirectory();
      });
    } catch (error) {
      logger.error(`Failed to get subdirectories of ${dir}:`, error);
      return [];
    }
  }

  /**
   * 清空目录但保留目录本身
   */
  clearDirectory(dir: string): void {
    if (!this.existsSync(dir)) {
      return;
    }

    try {
      const items = this.readdirSync(dir);
      items.forEach((item) => {
        const itemPath = this.join(dir, item);
        const stat = this.statSync(itemPath);

        if (stat.isDirectory()) {
          this.removeDirectory(itemPath);
        } else {
          this.unlinkSync(itemPath);
        }
      });
      logger.debug(`Cleared directory: ${dir}`);
    } catch (error) {
      logger.error(`Failed to clear directory ${dir}:`, error);
      throw error;
    }
  }
}

// 导出单例实例
export const fileSystem = new FileSystemManager();
