import { join } from 'node:path';

/**
 * 脚本配置管理
 */
export class ScriptConfig {
  /** 后端 DTO 目录 */
  public readonly backendDtoDir: string;

  /** 共享 DTO 输出目录 */
  public readonly sharedDtoDir: string;

  /** TypeScript 配置文件路径 */
  public readonly tsConfigPath: string;

  /** 脚本根目录 */
  public readonly scriptsDir: string;

  constructor() {
    this.scriptsDir = __dirname;
    this.backendDtoDir = join(this.scriptsDir, '../../src/modules');
    this.sharedDtoDir = join(
      this.scriptsDir,
      '../../../../../packages/shared/dto',
    );
    this.tsConfigPath = join(this.scriptsDir, '../../tsconfig.json');
  }

  /**
   * 获取模块输出目录
   */
  getModuleOutputDir(moduleName: string): string {
    return join(this.sharedDtoDir, moduleName);
  }

  /**
   * 获取类型输出目录
   */
  getTypeOutputDir(moduleName: string): string {
    return join(this.sharedDtoDir, moduleName, 'types');
  }

  /**
   * 获取监听目录
   */
  getWatchDir(): string {
    return join(this.scriptsDir, '../../src/modules/');
  }

  /**
   * 验证配置
   */
  validate(): boolean {
    try {
      const fs = require('fs');
      return (
        fs.existsSync(this.backendDtoDir) && fs.existsSync(this.tsConfigPath)
      );
    } catch {
      return false;
    }
  }
}

// 导出默认配置实例
export const config = new ScriptConfig();

// 重新导出模式
export * from './patterns';
