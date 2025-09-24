/**
 * 共享类型定义
 */

export interface DtoInfo {
  className: string;
  fileName: string;
}

export interface ModuleDtos {
  [moduleName: string]: DtoInfo[];
}

export interface DependencyInfo {
  /** 原始导入路径 */
  originalPath: string;
  /** 解析后的绝对路径 */
  resolvedPath: string;
  /** 是否是相对路径导入 */
  isRelativeImport: boolean;
  /** 是否是类型文件 */
  isTypeFile: boolean;
  /** 导入的内容（类型、接口、枚举等） */
  imports: string[];
  /** 是否是默认导入 */
  isDefaultImport: boolean;
}

export interface DependencyAnalysisResult {
  /** 主文件路径 */
  mainFile: string;
  /** 所有依赖文件 */
  dependencies: DependencyInfo[];
  /** 需要生成的类型映射 */
  typeMapping: Map<string, string>;
}

export interface GenerationOptions {
  /** 是否包含依赖分析 */
  includeDependencies?: boolean;
  /** 是否生成索引文件 */
  generateIndexes?: boolean;
  /** 是否清理旧文件 */
  cleanOldFiles?: boolean;
}

export interface WatcherOptions {
  /** 监听路径 */
  watchPath?: string;
  /** 是否忽略初始文件 */
  ignoreInitial?: boolean;
  /** 是否持久化监听 */
  persistent?: boolean;
}

export interface FileSystemInterface {
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory(): boolean };
  writeFileSync: (
    path: string,
    data: string,
    encoding?: BufferEncoding,
  ) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  existsSync: (path: string) => boolean;
  unlinkSync: (path: string) => void;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  join: (...paths: string[]) => string;
}
