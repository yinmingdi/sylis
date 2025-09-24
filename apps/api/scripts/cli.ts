#!/usr/bin/env node

/**
 * DTO 脚本统一 CLI 入口
 *
 * 使用方法:
 * - pnpm run dto:generate  # 生成所有 DTO
 * - pnpm run dto:watch     # 监听 DTO 变化
 * - pnpm run dto:clean     # 清理生成的文件
 */

import { DtoGenerator } from './core/generator';
import { DtoWatcher } from './core/watcher';
import { config } from './config';
import { fileSystem } from './utils/file-system';
import { logger } from './utils/logger';

interface CliOptions {
  verbose?: boolean;
  module?: string;
  noDeps?: boolean;
  noIndex?: boolean;
  clean?: boolean;
}

/**
 * CLI 命令处理器
 */
class DtoCli {
  private generator: DtoGenerator;
  private watcher: DtoWatcher | null = null;

  constructor() {
    this.generator = new DtoGenerator();
  }

  /**
   * 解析命令行参数
   */
  private parseArgs(): { command: string; options: CliOptions } {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const options: CliOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--module':
        case '-m':
          options.module = args[++i];
          break;
        case '--no-deps':
          options.noDeps = true;
          break;
        case '--no-index':
          options.noIndex = true;
          break;
        case '--clean':
          options.clean = true;
          break;
      }
    }

    return { command, options };
  }

  /**
   * 生成DTO命令
   */
  private async generateCommand(options: CliOptions): Promise<void> {
    logger.setVerbose(options.verbose || false);

    if (!config.validate()) {
      logger.error('Configuration validation failed. Please check your setup.');
      process.exit(1);
    }

    try {
      const allDtoFiles = fileSystem.getAllDtoFiles(config.backendDtoDir);
      logger.info(`Found ${allDtoFiles.length} DTO files`);

      if (allDtoFiles.length === 0) {
        logger.warn('No DTO files found to process');
        return;
      }

      await this.generator.generateDtos(allDtoFiles, {
        includeDependencies: !options.noDeps,
        generateIndexes: !options.noIndex,
        cleanOldFiles: options.clean,
      });
    } catch (error) {
      logger.error('DTO generation failed:', error);
      process.exit(1);
    }
  }

  /**
   * 监听命令
   */
  private watchCommand(options: CliOptions): void {
    logger.setVerbose(options.verbose || false);

    if (!config.validate()) {
      logger.error('Configuration validation failed. Please check your setup.');
      process.exit(1);
    }

    try {
      this.watcher = new DtoWatcher({
        watchPath: config.getWatchDir(),
        ignoreInitial: true,
        persistent: true,
      });

      // 优雅退出处理
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start watcher:', error);
      process.exit(1);
    }
  }

  /**
   * 清理命令
   */
  private cleanCommand(options: CliOptions): void {
    logger.setVerbose(options.verbose || false);

    try {
      this.generator.clean(options.module);

      if (options.module) {
        logger.success(`Cleaned module: ${options.module}`);
      } else {
        logger.success('Cleaned all generated DTO files');
      }
    } catch (error) {
      logger.error('Clean operation failed:', error);
      process.exit(1);
    }
  }

  /**
   * 帮助命令
   */
  private helpCommand(): void {
    console.log(`
📋 DTO Generator CLI

使用方法:
  pnpm run dto:generate [options]  # 生成 DTO 文件
  pnpm run dto:watch [options]     # 监听 DTO 变化
  pnpm run dto:clean [options]     # 清理生成的文件
  pnpm run dto:help               # 显示帮助信息

选项:
  --verbose, -v                   # 显示详细日志
  --module <name>, -m <name>      # 指定模块名（仅用于清理）
  --no-deps                       # 跳过依赖分析
  --no-index                      # 跳过索引文件生成
  --clean                         # 生成前清理旧文件

示例:
  pnpm run dto:generate --verbose
  pnpm run dto:generate --no-deps --clean
  pnpm run dto:clean --module auth
  pnpm run dto:watch --verbose

配置:
  后端 DTO 目录: ${config.backendDtoDir}
  共享 DTO 目录: ${config.sharedDtoDir}
  TypeScript 配置: ${config.tsConfigPath}
`);
  }

  /**
   * 设置优雅退出
   */
  private setupGracefulShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info(`\nReceived ${signal}, shutting down gracefully...`);
      if (this.watcher) {
        this.watcher.close();
      }
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * 运行CLI
   */
  async run(): Promise<void> {
    const { command, options } = this.parseArgs();

    switch (command) {
      case 'generate':
        await this.generateCommand(options);
        break;
      case 'watch':
        this.watchCommand(options);
        break;
      case 'clean':
        this.cleanCommand(options);
        break;
      case 'help':
      default:
        this.helpCommand();
        if (command !== 'help') {
          process.exit(1);
        }
        break;
    }
  }
}

// 运行CLI
if (require.main === module) {
  const cli = new DtoCli();
  cli.run().catch((error) => {
    logger.error('CLI execution failed:', error);
    process.exit(1);
  });
}

export { DtoCli };
