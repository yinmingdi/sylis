import {
  ClassDeclaration,
  PropertyDeclaration,
  InterfaceDeclaration,
} from 'ts-morph';
import { patterns } from '../config';
import { logger } from './logger';

/**
 * 类型处理工具类
 */
export class TypeHelper {
  /**
   * 从 TypeScript 类生成 DTO 接口内容
   */
  static generateInterfaceFromClass(
    cls: ClassDeclaration,
    usedTypes: Set<string> = new Set(),
  ): string {
    const className = cls.getName();
    if (!className) return '';

    let content = `export interface ${className} {\n`;
    const properties = cls.getProperties();

    properties.forEach((prop: PropertyDeclaration) => {
      const propName = prop.getName();
      const propType = prop.getTypeNode()?.getText() ?? 'any';
      const isOptional = prop.hasQuestionToken();

      // 记录使用的类型
      this.recordUsedTypes(propType, usedTypes);

      content += `  ${propName}${isOptional ? '?' : ''}: ${propType};\n`;
    });

    content += '}\n\n';
    return content;
  }

  /**
   * 从 TypeScript 接口生成接口内容
   */
  static generateInterfaceFromInterface(
    intf: InterfaceDeclaration,
    usedTypes: Set<string> = new Set(),
  ): string {
    const interfaceName = intf.getName();
    if (!interfaceName) return '';

    let content = `export interface ${interfaceName} {\n`;
    const properties = intf.getProperties();

    properties.forEach((prop) => {
      const propName = prop.getName();
      const propType = prop.getTypeNode()?.getText() ?? 'any';
      const isOptional = prop.hasQuestionToken();

      // 记录使用的类型
      this.recordUsedTypes(propType, usedTypes);

      content += `  ${propName}${isOptional ? '?' : ''}: ${propType};\n`;
    });

    content += '}\n\n';
    return content;
  }

  /**
   * 记录在类型中使用的类型名
   */
  static recordUsedTypes(typeText: string, usedTypes: Set<string>): void {
    const typeNames = typeText.match(patterns.typeReference) || [];
    typeNames.forEach((typeName) => {
      // 排除基础类型
      if (!this.isBuiltInType(typeName)) {
        usedTypes.add(typeName);
      }
    });
  }

  /**
   * 检查是否是内置类型
   */
  static isBuiltInType(typeName: string): boolean {
    const builtInTypes = [
      'Array',
      'Promise',
      'Date',
      'RegExp',
      'Error',
      'Map',
      'Set',
      'String',
      'Number',
      'Boolean',
      'Object',
      'Function',
      // TypeScript内置工具类型
      'Partial',
      'Required',
      'Readonly',
      'Record',
      'Pick',
      'Omit',
      'Exclude',
      'Extract',
      'NonNullable',
      'ReturnType',
      'Parameters',
    ];
    return builtInTypes.includes(typeName);
  }

  /**
   * 清理装饰器相关的类型引用
   */
  static cleanDecoratorTypes(typeText: string): string {
    return typeText
      .replace(/Type\(\(\) => (\w+)\)/g, '$1') // 移除 @Type 装饰器
      .replace(/ValidateNested.*?\n/g, '') // 移除验证装饰器
      .replace(/class-validator/g, '') // 移除 class-validator 相关
      .trim();
  }

  /**
   * 检查是否是类型文件
   */
  static isTypeFile(filePath: string): boolean {
    return (
      filePath.includes('/types/') ||
      filePath.includes('.types.') ||
      filePath.includes('.interface.') ||
      filePath.endsWith('.types.ts') ||
      filePath.endsWith('.interfaces.ts')
    );
  }

  /**
   * 从文件路径提取模块名
   */
  static extractModuleName(filePath: string): string {
    const match = filePath.match(/modules\/(.*?)\/dto/);
    return match ? match[1] : 'unknown';
  }

  /**
   * 从路径获取文件名
   */
  static getFileNameFromPath(filePath: string): string {
    return filePath.split(/[/\\]/).pop() || 'unknown.ts';
  }

  /**
   * 生成导入语句
   */
  static generateImportStatement(
    imports: string[],
    from: string,
    isTypeOnly: boolean = true,
  ): string {
    if (imports.length === 0) return '';

    const typePrefix = isTypeOnly ? 'type ' : '';
    return `import ${typePrefix}{ ${imports.join(', ')} } from '${from}';\n`;
  }

  /**
   * 解析导入语句
   */
  static parseImportStatement(importStatement: string): {
    imports: string[];
    from: string;
    isTypeOnly: boolean;
  } {
    const match = importStatement.match(
      /import\s+(?:(type)\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/,
    );

    if (!match) {
      logger.warn(`Failed to parse import statement: ${importStatement}`);
      return { imports: [], from: '', isTypeOnly: false };
    }

    return {
      isTypeOnly: !!match[1],
      imports: match[2].split(',').map((imp) => imp.trim()),
      from: match[3],
    };
  }

  /**
   * 检查值是否是枚举类型
   */
  static isEnum(value: any): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length > 0 &&
      Object.keys(value).every((key) => typeof value[key] === 'string')
    );
  }

  /**
   * 生成枚举定义
   */
  static generateEnumDefinition(enumName: string, enumValue: any): string {
    let content = `export enum ${enumName} {\n`;
    Object.keys(enumValue).forEach((key) => {
      content += `  ${key} = '${enumValue[key]}',\n`;
    });
    content += '}\n\n';
    return content;
  }
}
