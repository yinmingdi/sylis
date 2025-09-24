/**
 * 模式和正则表达式定义
 */

export const patterns = {
  /** 模块路径匹配模式 */
  modulePath: /modules\/(.*?)\/dto\/(.*?\.dto\.ts)$/,

  /** 导出类型匹配模式 */
  exportType: /export type \{ ([^}]+) \} from/g,

  /** 接口定义匹配模式 */
  interfaceDefinition: /export interface (\w+)/g,

  /** 类定义匹配模式 */
  classDefinition: /export class (\w+)/g,

  /** 类型别名匹配模式 */
  typeAlias: /export type (\w+)/g,

  /** 枚举定义匹配模式 */
  enumDefinition: /export enum (\w+)/g,

  /** 导入语句匹配模式 */
  importStatement: /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,

  /** TypeScript类型匹配模式 */
  typeReference: /\b[A-Z]\w+\b/g,
} as const;

export const filePatterns = {
  /** DTO文件模式 */
  dtoFile: /\.dto\.ts$/,

  /** 类型文件模式 */
  typeFile: /\.(types|interfaces?)\.ts$/,

  /** TypeScript文件模式 */
  tsFile: /\.tsx?$/,
} as const;

export const pathPatterns = {
  /** 相对路径模式 */
  relativePath: /^\.{1,2}\//,

  /** Scoped包模式 */
  scopedPackage: /^@[\w-]+\/[\w-]+/,

  /** Node模块模式 */
  nodeModule: /^[a-zA-Z][\w-]*$/,
} as const;
