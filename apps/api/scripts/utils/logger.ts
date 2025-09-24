/**
 * 统一日志工具
 */
export class Logger {
  private static instance: Logger;
  private verbose: boolean = false;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  info(message: string, ...args: any[]): void {
    console.log(`ℹ️ ${message}`, ...args);
  }

  success(message: string, ...args: any[]): void {
    console.log(`✅ ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`⚠️ ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`❌ ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.log(`🐛 ${message}`, ...args);
    }
  }

  watch(message: string, ...args: any[]): void {
    console.log(`👀 [watch] ${message}`, ...args);
  }

  generate(message: string, ...args: any[]): void {
    console.log(`📝 [generate] ${message}`, ...args);
  }

  delete(message: string, ...args: any[]): void {
    console.log(`🗑️ [delete] ${message}`, ...args);
  }

  progress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    console.log(`🔄 ${message} (${current}/${total} - ${percentage}%)`);
  }

  section(title: string): void {
    console.log(`\n🚀 === ${title} ===`);
  }

  done(message: string = 'All operations completed successfully!'): void {
    console.log(`\n🎉 ${message}\n`);
  }
}

// 导出单例实例
export const logger = Logger.getInstance();
