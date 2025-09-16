#!/usr/bin/env node

/**
 * DTO 生成脚本统一入口
 *
 * 使用方法:
 * - pnpm run dto:generate  # 生成所有 DTO
 * - pnpm run dto:watch     # 监听 DTO 变化
 */

import { config } from './config';
import { getAllDtoFiles, generateDtos } from './utils';

const command = process.argv[2] as 'generate' | 'watch' | undefined;

switch (command) {
  case 'generate':
    generateAllDtos();
    break;
  case 'watch':
    startWatcher();
    break;
  default:
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
📋 DTO Generator Scripts

使用方法:
  pnpm run dto:generate  # 生成所有 DTO
  pnpm run dto:watch     # 监听 DTO 变化

或者直接运行:
  npx tsx scripts/index.ts generate
  npx tsx scripts/index.ts watch
`);
}

/**
 * 生成所有 DTO 文件
 */
function generateAllDtos(): void {
  console.log('🚀 Starting DTO generation...');

  try {
    const allDtoFiles = getAllDtoFiles(config.backendDtoDir);
    console.log(`📁 Found ${allDtoFiles.length} DTO files`);

    generateDtos(allDtoFiles);

    console.log('✅ DTO generation completed successfully!');
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ DTO generation failed:', error.message);
    } else {
      console.error('❌ DTO generation failed:', error);
    }
    process.exit(1);
  }
}

/**
 * 启动文件监听器
 */
function startWatcher(): void {
  // 动态导入以避免在不需要时加载 chokidar
  import('./watcher')
    .then((mod) => {
      const DtoWatcher = mod.DtoWatcher as { new (): { close: () => void } };
      const watcher = new DtoWatcher();

      // 优雅退出
      process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down...');
        watcher.close();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, shutting down...');
        watcher.close();
        process.exit(0);
      });
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        console.error('❌ Failed to start watcher:', error.message);
      } else {
        console.error('❌ Failed to start watcher:', error);
      }
      process.exit(1);
    });
}
