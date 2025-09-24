import * as chokidar from 'chokidar';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DtoGenerator } from './generator';
import type { WatcherOptions } from '../types';

/**
 * 文件监听器
 */
export class DtoWatcher {
  private watcher: chokidar.FSWatcher;
  private generator: DtoGenerator;

  constructor(options: WatcherOptions = {}) {
    const {
      watchPath = config.getWatchDir(),
      ignoreInitial = true,
      persistent = true,
    } = options;

    this.generator = new DtoGenerator();

    this.watcher = chokidar.watch(watchPath, {
      persistent,
      ignoreInitial,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
      ],
    });

    this.setupEventHandlers();
    logger.watch(`Watching DTO files: ${watchPath}`);
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.watcher.on('add', this.handleFileAdd.bind(this));
    this.watcher.on('change', this.handleFileChange.bind(this));
    this.watcher.on('unlink', this.handleFileDelete.bind(this));
    this.watcher.on('error', this.handleError.bind(this));
  }

  /**
   * 处理文件添加
   */
  private async handleFileAdd(path: string): Promise<void> {
    if (this.isDtoFile(path)) {
      logger.watch(`DTO file added: ${path}`);
      try {
        await this.generator.generateDtos([path], {
          includeDependencies: true,
          generateIndexes: true,
          cleanOldFiles: false,
        });
        logger.success(`DTO generated for: ${path}`);
      } catch (error) {
        logger.error(`Failed to generate DTO for ${path}:`, error);
      }
    }
  }

  /**
   * 处理文件更改
   */
  private async handleFileChange(path: string): Promise<void> {
    if (this.isDtoFile(path)) {
      logger.watch(`DTO file changed: ${path}`);
      try {
        await this.generator.generateDtos([path], {
          includeDependencies: true,
          generateIndexes: true,
          cleanOldFiles: false,
        });
        logger.success(`DTO regenerated for: ${path}`);
      } catch (error) {
        logger.error(`Failed to regenerate DTO for ${path}:`, error);
      }
    }
  }

  /**
   * 处理文件删除
   */
  private handleFileDelete(path: string): void {
    if (this.isDtoFile(path)) {
      logger.watch(`DTO file deleted: ${path}`);
      try {
        this.generator.deleteDto(path);
        logger.success(`Cleaned up DTO for: ${path}`);
      } catch (error) {
        logger.error(`Failed to cleanup DTO for ${path}:`, error);
      }
    }
  }

  /**
   * 处理监听错误
   */
  private handleError(error: Error): void {
    logger.error('Watcher error:', error);
  }

  /**
   * 检查是否是DTO文件
   */
  private isDtoFile(path: string): boolean {
    return path.endsWith('.dto.ts');
  }

  /**
   * 关闭监听器
   */
  close(): void {
    this.watcher.close();
    logger.info('DTO watcher stopped');
  }

  /**
   * 获取监听状态
   */
  isWatching(): boolean {
    return !this.watcher.closed;
  }

  /**
   * 暂停监听
   */
  pause(): void {
    this.watcher.unwatch('*');
    logger.info('DTO watcher paused');
  }

  /**
   * 恢复监听
   */
  resume(): void {
    const watchPath = config.getWatchDir();
    this.watcher.add(watchPath);
    logger.info('DTO watcher resumed');
  }
}
