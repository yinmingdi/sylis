import { SourceFile, Project, ImportDeclaration } from 'ts-morph';
import { join, relative, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../config';
import { fileSystem } from '../utils/file-system';
import { logger } from '../utils/logger';
import { TypeHelper } from '../utils/type-helper';
import type { DependencyInfo, DependencyAnalysisResult } from '../types';

/**
 * 依赖分析器 - 简化版本，专注核心功能
 */
export class DependencyAnalyzer {
  private project: Project;
  private processedFiles = new Set<string>();

  constructor() {
    this.project = new Project({
      tsConfigFilePath: config.tsConfigPath,
    });
  }

  /**
   * 分析DTO文件的所有依赖
   */
  analyzeDependencies(dtoFilePath: string): DependencyAnalysisResult {
    this.processedFiles.clear();
    const sourceFile = this.project.addSourceFileAtPathIfExists(dtoFilePath);

    if (!sourceFile) {
      throw new Error(`Cannot find source file: ${dtoFilePath}`);
    }

    const dependencies: DependencyInfo[] = [];
    const typeMapping = new Map<string, string>();

    this.analyzeDependenciesRecursive(sourceFile, dependencies, typeMapping);

    return {
      mainFile: dtoFilePath,
      dependencies,
      typeMapping,
    };
  }

  /**
   * 递归分析文件依赖
   */
  private analyzeDependenciesRecursive(
    sourceFile: SourceFile,
    dependencies: DependencyInfo[],
    typeMapping: Map<string, string>,
  ): void {
    const filePath = sourceFile.getFilePath();

    if (this.processedFiles.has(filePath)) {
      return;
    }

    this.processedFiles.add(filePath);
    const imports = sourceFile.getImportDeclarations();

    for (const importDecl of imports) {
      const dependency = this.analyzeImport(importDecl, sourceFile);

      if (dependency && this.shouldIncludeDependency(dependency)) {
        dependencies.push(dependency);

        // 如果是相对路径的类型文件，递归分析
        if (dependency.isRelativeImport && dependency.isTypeFile) {
          try {
            const depSourceFile = this.project.addSourceFileAtPathIfExists(
              dependency.resolvedPath,
            );
            if (depSourceFile) {
              this.analyzeDependenciesRecursive(
                depSourceFile,
                dependencies,
                typeMapping,
              );
            }
          } catch (error) {
            logger.warn(
              `Cannot analyze dependency: ${dependency.resolvedPath}`,
              error,
            );
          }
        }
      }
    }
  }

  /**
   * 分析单个导入声明
   */
  private analyzeImport(
    importDecl: ImportDeclaration,
    sourceFile: SourceFile,
  ): DependencyInfo | null {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const sourceFilePath = sourceFile.getFilePath();

    const resolvedPath = this.resolveImportPath(
      moduleSpecifier,
      sourceFilePath,
    );
    if (!resolvedPath) {
      return null;
    }

    const imports: string[] = [];
    let isDefaultImport = false;

    const importClause = importDecl.getImportClause();
    if (importClause) {
      // 默认导入
      const defaultImport = importClause.getDefaultImport();
      if (defaultImport) {
        imports.push(defaultImport.getText());
        isDefaultImport = true;
      }

      // 命名导入
      const namedImports = importClause.getNamedImports();
      if (namedImports) {
        namedImports.forEach((element) => {
          imports.push(element.getName());
        });
      }

      // 命名空间导入
      const namespaceImport = importClause.getNamespaceImport();
      if (namespaceImport) {
        imports.push(`* as ${namespaceImport.getText()}`);
      }
    }

    return {
      originalPath: moduleSpecifier,
      resolvedPath,
      isRelativeImport: moduleSpecifier.startsWith('.'),
      isTypeFile: TypeHelper.isTypeFile(resolvedPath),
      imports,
      isDefaultImport,
    };
  }

  /**
   * 解析导入路径
   */
  private resolveImportPath(
    moduleSpecifier: string,
    fromFile: string,
  ): string | null {
    if (!moduleSpecifier.startsWith('.')) {
      return moduleSpecifier; // 外部模块
    }

    const fromDir = dirname(fromFile);
    const basePath = resolve(fromDir, moduleSpecifier);
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];

    // 尝试不同的文件扩展名
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    // 尝试 index 文件
    for (const ext of extensions) {
      const indexPath = join(basePath, `index${ext}`);
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  /**
   * 判断是否应该包含此依赖
   */
  private shouldIncludeDependency(dependency: DependencyInfo): boolean {
    // 包含相对路径的类型文件
    if (dependency.isRelativeImport && dependency.isTypeFile) {
      return true;
    }

    // 包含相对路径的 DTO 文件（跨模块依赖）
    if (
      dependency.isRelativeImport &&
      dependency.resolvedPath.includes('/dto/')
    ) {
      return true;
    }

    // 包含来自shared包的导入
    if (dependency.originalPath.includes('@sylis/')) {
      return true;
    }

    // 包含来自@prisma/client的特定类型
    if (dependency.originalPath === '@prisma/client') {
      return true;
    }

    return false;
  }

  /**
   * 生成依赖文件到shared包
   */
  async generateDependencies(
    analysisResult: DependencyAnalysisResult,
  ): Promise<void> {
    const moduleName = TypeHelper.extractModuleName(analysisResult.mainFile);

    for (const dependency of analysisResult.dependencies) {
      try {
        // 跳过跨模块 DTO 依赖，这些会在文件头部直接导入
        if (
          dependency.isRelativeImport &&
          dependency.resolvedPath.includes('/dto/')
        ) {
          continue;
        }

        if (dependency.isRelativeImport && dependency.isTypeFile) {
          await this.copyTypeFile(dependency, moduleName);
        } else {
          await this.generateExternalTypes(dependency, moduleName);
        }
      } catch (error) {
        logger.warn(
          `Failed to generate dependency ${dependency.originalPath}:`,
          error,
        );
      }
    }
  }

  /**
   * 复制类型文件
   */
  private async copyTypeFile(
    dependency: DependencyInfo,
    moduleName: string,
  ): Promise<void> {
    const sourceFile = this.project.addSourceFileAtPathIfExists(
      dependency.resolvedPath,
    );
    if (!sourceFile) {
      logger.warn(`Cannot find source file: ${dependency.resolvedPath}`);
      return;
    }

    const outputDir = config.getTypeOutputDir(moduleName);
    const fileName = TypeHelper.getFileNameFromPath(dependency.resolvedPath);
    const outputPath = join(outputDir, fileName);

    const content = this.generateTypeContent(sourceFile);
    fileSystem.writeFileWithDir(outputPath, content);

    logger.debug(`Generated type file: ${outputPath}`);
  }

  /**
   * 生成外部依赖类型
   */
  private async generateExternalTypes(
    dependency: DependencyInfo,
    moduleName: string,
  ): Promise<void> {
    const outputDir = config.getTypeOutputDir(moduleName);

    let fileName: string;
    if (dependency.originalPath === '@prisma/client') {
      fileName = 'prisma.types.ts';
    } else if (dependency.originalPath.includes('@sylis/')) {
      fileName = 'shared.types.ts';
    } else {
      fileName = dependency.originalPath.replace(/[@\/]/g, '-') + '.types.ts';
    }

    const outputPath = join(outputDir, fileName);
    const newContent = this.generateExternalTypeContent(dependency);

    // 对于 Prisma types，需要合并已有的类型定义以避免覆盖
    if (
      dependency.originalPath === '@prisma/client' &&
      existsSync(outputPath)
    ) {
      try {
        const fs = require('fs');
        const existingContent = fs.readFileSync(outputPath, 'utf-8');
        const mergedContent = this.mergeTypeDefinitions(
          existingContent,
          newContent,
        );
        fileSystem.writeFileWithDir(outputPath, mergedContent);
        logger.debug(`Merged and updated external types: ${outputPath}`);
      } catch (error) {
        logger.warn(`Failed to merge types, overwriting:`, error);
        fileSystem.writeFileWithDir(outputPath, newContent);
      }
    } else {
      fileSystem.writeFileWithDir(outputPath, newContent);
      logger.debug(`Generated external types: ${outputPath}`);
    }
  }

  /**
   * 合并类型定义，避免重复
   */
  private mergeTypeDefinitions(existing: string, newContent: string): string {
    // 提取注释头部
    const headerMatch = newContent.match(/^(\/\/[^\n]*\n)+/);
    const header = headerMatch
      ? headerMatch[0]
      : '// Auto-generated from Prisma schema\n\n';

    // 提取现有的类型名称
    const existingTypes = new Set<string>();
    const typePattern = /export\s+(enum|interface|type)\s+(\w+)/g;
    let match;
    while ((match = typePattern.exec(existing)) !== null) {
      existingTypes.add(match[2]);
    }

    // 解析新内容中的类型定义
    const newTypes = new Map<string, string>();
    const newTypePattern =
      /(export\s+(?:enum|interface|type)\s+\w+[\s\S]*?)(?=\n\nexport\s+(?:enum|interface|type)\s+\w+|\n*$)/g;
    while ((match = newTypePattern.exec(newContent)) !== null) {
      const typeText = match[1].trim();
      const nameMatch = typeText.match(
        /export\s+(?:enum|interface|type)\s+(\w+)/,
      );
      if (nameMatch) {
        newTypes.set(nameMatch[1], typeText);
      }
    }

    // 合并：保留现有的，添加新的（不重复）
    let mergedContent = existing;
    newTypes.forEach((typeText, typeName) => {
      if (!existingTypes.has(typeName)) {
        mergedContent += '\n' + typeText + '\n';
        logger.info(`[DEBUG] Added new type to merged file: ${typeName}`);
      } else {
        logger.info(`[DEBUG] Type already exists, skipping: ${typeName}`);
      }
    });

    return mergedContent;
  }

  /**
   * 生成纯类型内容
   */
  private generateTypeContent(sourceFile: SourceFile): string {
    let content = '// Auto-generated type definitions\n\n';

    // 导出枚举
    sourceFile.getEnums().forEach((enumDecl) => {
      if (enumDecl.isExported()) {
        content += enumDecl.getText() + '\n\n';
      }
    });

    // 导出接口
    sourceFile.getInterfaces().forEach((interfaceDecl) => {
      if (interfaceDecl.isExported()) {
        content += interfaceDecl.getText() + '\n\n';
      }
    });

    // 导出类型别名
    sourceFile.getTypeAliases().forEach((typeAlias) => {
      if (typeAlias.isExported()) {
        content += typeAlias.getText() + '\n\n';
      }
    });

    return content;
  }

  /**
   * 生成外部包类型内容
   */
  private generateExternalTypeContent(dependency: DependencyInfo): string {
    logger.info(
      `[DEBUG] generateExternalTypeContent called for: ${dependency.originalPath}`,
    );
    logger.info(`[DEBUG] Imports: ${dependency.imports.join(', ')}`);

    let content = '// Auto-generated external type definitions\n';
    content += `// Source: ${dependency.originalPath}\n\n`;

    if (dependency.imports.length === 0) {
      logger.info(`[DEBUG] No imports, returning early`);
      return content;
    }

    // 对于 @prisma/client，从 schema 提取真实的枚举定义
    if (dependency.originalPath === '@prisma/client') {
      logger.info(
        `[DEBUG] Detected @prisma/client, calling generatePrismaTypeContent`,
      );
      return this.generatePrismaTypeContent(dependency.imports);
    }

    // 对于其他外部依赖，尝试从 node_modules 提取真实类型定义
    logger.info(`[DEBUG] Attempting to extract real types from node_modules`);
    return this.extractExternalTypes(dependency);
  }

  /**
   * 从 node_modules 提取外部类型的真实定义
   */
  private extractExternalTypes(dependency: DependencyInfo): string {
    let content = '// Auto-generated external type definitions\n';
    content += `// Source: ${dependency.originalPath}\n\n`;

    try {
      const apiRootDir = resolve(config.scriptsDir, '../..');
      const packageName = dependency.originalPath;

      // 查找包的入口文件
      let packageJsonPath: string;
      let packageDir: string;

      // 如果是 @scope/package 格式
      if (packageName.startsWith('@')) {
        const [scope, name] = packageName.split('/');
        packageDir = join(apiRootDir, 'node_modules', scope, name);
      } else {
        packageDir = join(apiRootDir, 'node_modules', packageName);
      }

      packageJsonPath = join(packageDir, 'package.json');

      logger.info(`[DEBUG] Looking for package at: ${packageDir}`);

      if (!existsSync(packageJsonPath)) {
        logger.warn(`[DEBUG] Cannot find package.json for ${packageName}`);
        const importsStr = dependency.imports.join(', ');
        return (
          content + `export type { ${importsStr} } from '${packageName}';\n`
        );
      }

      const fs = require('fs');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // 尝试找到类型定义文件
      const typesEntry =
        packageJson.types || packageJson.typings || 'index.d.ts';
      const typesPath = join(packageDir, typesEntry);

      logger.info(`[DEBUG] Types entry: ${typesEntry}`);
      logger.info(`[DEBUG] Types path: ${typesPath}`);

      if (!existsSync(typesPath)) {
        logger.warn(`[DEBUG] Cannot find types file at ${typesPath}`);
        const importsStr = dependency.imports.join(', ');
        return (
          content + `export type { ${importsStr} } from '${packageName}';\n`
        );
      }

      // 加载类型文件
      const sourceFile = this.project.addSourceFileAtPathIfExists(typesPath);

      if (!sourceFile) {
        logger.warn(`[DEBUG] Cannot load types file for ${packageName}`);
        const importsStr = dependency.imports.join(', ');
        return (
          content + `export type { ${importsStr} } from '${packageName}';\n`
        );
      }

      // 提取每个导入的类型定义
      for (const importName of dependency.imports) {
        logger.info(`[DEBUG] Extracting type: ${importName}`);

        // 尝试获取各种类型的定义
        const enumDecl = sourceFile.getEnum(importName);
        if (enumDecl) {
          content += enumDecl.getText() + '\n\n';
          logger.info(`[DEBUG] Extracted enum: ${importName}`);
          continue;
        }

        const interfaceDecl = sourceFile.getInterface(importName);
        if (interfaceDecl) {
          content += interfaceDecl.getText() + '\n\n';
          logger.info(`[DEBUG] Extracted interface: ${importName}`);
          continue;
        }

        const typeAlias = sourceFile.getTypeAlias(importName);
        if (typeAlias) {
          content += typeAlias.getText() + '\n\n';
          logger.info(`[DEBUG] Extracted type alias: ${importName}`);
          continue;
        }

        const classDecl = sourceFile.getClass(importName);
        if (classDecl) {
          // 对于类，生成对应的接口
          content += `export interface ${importName} {\n`;
          classDecl.getProperties().forEach((prop) => {
            const propName = prop.getName();
            const propType = prop.getType().getText();
            const isOptional = prop.hasQuestionToken();
            content += `  ${propName}${isOptional ? '?' : ''}: ${propType};\n`;
          });
          content += `}\n\n`;
          logger.info(`[DEBUG] Extracted class as interface: ${importName}`);
          continue;
        }

        const variableDecl = sourceFile.getVariableDeclaration(importName);
        if (variableDecl) {
          const varType = variableDecl.getType().getText();
          content += `export type ${importName} = ${varType};\n\n`;
          logger.info(`[DEBUG] Extracted variable type: ${importName}`);
          continue;
        }

        // 如果都找不到，使用 any 占位
        logger.warn(
          `[DEBUG] Cannot find definition for ${importName}, using any`,
        );
        content += `export type ${importName} = any; // TODO: Could not extract type\n\n`;
      }

      logger.info(`[DEBUG] Successfully extracted types from ${packageName}`);
      return content;
    } catch (error) {
      logger.warn(`[DEBUG] Failed to extract types:`, error);
      const importsStr = dependency.imports.join(', ');
      return (
        content +
        `export type { ${importsStr} } from '${dependency.originalPath}';\n`
      );
    }
  }

  /**
   * 从 Prisma Schema 提取真实的枚举定义
   */
  private generatePrismaTypeContent(imports: string[]): string {
    let content = '// Auto-generated from Prisma schema\n\n';

    try {
      logger.info(`[DEBUG] Extracting Prisma types for: ${imports.join(', ')}`);

      // 从 Prisma schema 文件中提取枚举定义
      // config.scriptsDir 是 apps/api/scripts/config，所以需要往上退两层到 apps/api
      const apiRootDir = resolve(config.scriptsDir, '../..');
      const prismaSchemaDir = join(apiRootDir, 'prisma', 'schema');

      logger.info(`[DEBUG] API root dir: ${apiRootDir}`);
      logger.info(`[DEBUG] Prisma schema dir: ${prismaSchemaDir}`);

      if (!existsSync(prismaSchemaDir)) {
        logger.warn(
          `[DEBUG] Cannot find Prisma schema directory: ${prismaSchemaDir}`,
        );
        const importsStr = imports.join(', ');
        return (
          content + `export type { ${importsStr} } from '@prisma/client';\n`
        );
      }

      const fs = require('fs');
      const schemaFiles = fs
        .readdirSync(prismaSchemaDir)
        .filter((f: string) => f.endsWith('.prisma'));

      logger.info(
        `[DEBUG] Found ${schemaFiles.length} schema files: ${schemaFiles.join(', ')}`,
      );

      const enumDefinitions = new Map<string, string[]>();
      const modelDefinitions = new Set<string>();

      // 读取所有 schema 文件，提取枚举和 model 定义
      for (const schemaFile of schemaFiles) {
        const schemaPath = join(prismaSchemaDir, schemaFile);
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

        logger.info(`[DEBUG] Reading schema file: ${schemaFile}`);

        // 正则匹配枚举定义
        const enumPattern = /enum\s+(\w+)\s*\{([^}]+)\}/g;
        let match;

        while ((match = enumPattern.exec(schemaContent)) !== null) {
          const enumName = match[1];
          const enumBody = match[2];

          logger.info(`[DEBUG] Found enum: ${enumName}`);

          // 提取枚举值（去除注释）
          const values = enumBody
            .split('\n')
            .map((line) => line.trim())
            .filter(
              (line) =>
                line && !line.startsWith('///') && !line.startsWith('//'),
            )
            .map((line) => line.split(/\s+/)[0]) // 取第一个单词作为枚举值
            .filter((v) => v);

          logger.info(
            `[DEBUG] Extracted values for ${enumName}: ${values.join(', ')}`,
          );
          enumDefinitions.set(enumName, values);
        }

        // 正则匹配 model 定义
        const modelPattern = /model\s+(\w+)\s*\{/g;
        while ((match = modelPattern.exec(schemaContent)) !== null) {
          const modelName = match[1];
          modelDefinitions.add(modelName);
          logger.info(`[DEBUG] Found model: ${modelName}`);
        }
      }

      logger.info(`[DEBUG] Total enums found: ${enumDefinitions.size}`);
      logger.info(
        `[DEBUG] Enum names: ${Array.from(enumDefinitions.keys()).join(', ')}`,
      );
      logger.info(`[DEBUG] Total models found: ${modelDefinitions.size}`);
      logger.info(
        `[DEBUG] Model names: ${Array.from(modelDefinitions).join(', ')}`,
      );

      // 尝试从生成的 Prisma Client 中提取 Model 类型
      let prismaClientSource: any = null;

      try {
        // 使用 require.resolve 找到 @prisma/client 的实际位置（支持 pnpm）
        const Module = require('module');

        // 从 @prisma/client 包的路径找到 .prisma/client 目录
        // 例如：node_modules/.pnpm/@prisma+client@x.x.x/node_modules/@prisma/client
        const prismaClientPackageDir = dirname(
          Module.createRequire(join(apiRootDir, 'package.json')).resolve(
            '@prisma/client/package.json',
          ),
        );

        logger.info(
          `[DEBUG] Prisma Client package dir: ${prismaClientPackageDir}`,
        );

        // .prisma/client 在 node_modules 下，与 @prisma 同级
        // 结构：node_modules/.pnpm/@prisma+client@x.x.x/node_modules/{@prisma/, .prisma/}
        // prismaClientPackageDir 是 .../@prisma/client
        // dirname 一次得到 .../@prisma
        // 再 dirname 一次得到 .../node_modules
        const nodeModulesDir = dirname(dirname(prismaClientPackageDir));
        const dotPrismaDir = join(nodeModulesDir, '.prisma', 'client');
        const prismaClientIndexPath = join(dotPrismaDir, 'index.d.ts');

        logger.info(`[DEBUG] Node modules dir: ${nodeModulesDir}`);
        logger.info(
          `[DEBUG] Looking for Prisma Client types at: ${prismaClientIndexPath}`,
        );

        if (existsSync(prismaClientIndexPath)) {
          prismaClientSource = this.project.addSourceFileAtPathIfExists(
            prismaClientIndexPath,
          );
          if (prismaClientSource) {
            logger.info(
              `[DEBUG] Successfully loaded Prisma Client types from: ${prismaClientIndexPath}`,
            );
          } else {
            logger.warn(`[DEBUG] Failed to parse Prisma Client types file`);
          }
        } else {
          logger.warn(
            `[DEBUG] Prisma Client types file not found at: ${prismaClientIndexPath}`,
          );
        }
      } catch (error) {
        logger.warn(`[DEBUG] Failed to locate Prisma Client:`, error);
      }

      // 生成需要的类型
      imports.forEach((importName) => {
        const enumValues = enumDefinitions.get(importName);

        // 如果是枚举类型
        if (enumValues && enumValues.length > 0) {
          content += `export enum ${importName} {\n`;
          enumValues.forEach((value) => {
            content += `  ${value} = '${value}',\n`;
          });
          content += `}\n\n`;
          logger.info(`[DEBUG] Generated enum for ${importName}`);
        }
        // 如果是 Model 类型
        else if (modelDefinitions.has(importName)) {
          // 尝试从 Prisma Client 提取类型定义
          if (prismaClientSource) {
            // 先尝试interface
            let typeDecl = prismaClientSource.getInterface(importName);
            let typeText: string | null = null;

            if (typeDecl) {
              typeText = typeDecl.getText();
              logger.info(
                `[DEBUG] Extracted model interface for ${importName}`,
              );
            } else {
              // 如果不是interface，尝试type alias
              const typeAliasDecl = prismaClientSource.getTypeAlias(importName);
              if (typeAliasDecl) {
                // 获取类型的完整文本
                const typeNode = typeAliasDecl.getTypeNode();
                if (typeNode) {
                  // 尝试获取类型的完整定义（包括所有引用的类型）
                  const typeValue = typeAliasDecl.getType();
                  const properties = typeValue.getProperties();

                  if (properties.length > 0) {
                    // 手动构建接口定义
                    typeText = `export interface ${importName} {\n`;
                    properties.forEach((prop) => {
                      const propName = prop.getName();
                      const propType = prop.getTypeAtLocation(typeAliasDecl);
                      const propTypeText = propType.getText();
                      const isOptional =
                        propType.isNullable() || propType.isUndefined();
                      typeText += `  ${propName}${isOptional ? '?' : ''}: ${propTypeText};\n`;
                    });
                    typeText += '}';
                    logger.info(
                      `[DEBUG] Extracted and expanded model type for ${importName}`,
                    );
                  } else {
                    // 如果无法展开，使用原始定义
                    typeText = typeAliasDecl.getText();
                    logger.info(
                      `[DEBUG] Extracted model type alias for ${importName}`,
                    );
                  }
                }
              }
            }

            if (typeText) {
              content += typeText + '\n\n';
            } else {
              logger.warn(
                `[DEBUG] Cannot find type definition for model ${importName}, using re-export`,
              );
              content += `export type { ${importName} } from '@prisma/client';\n\n`;
            }
          } else {
            // 如果无法加载 Prisma Client，使用重导出
            logger.warn(
              `[DEBUG] Prisma Client not available, using re-export for ${importName}`,
            );
            content += `export type { ${importName} } from '@prisma/client';\n\n`;
          }
        }
        // 其他类型
        else {
          logger.warn(
            `[DEBUG] Cannot find type definition for ${importName}, using re-export`,
          );
          content += `export type { ${importName} } from '@prisma/client';\n\n`;
        }
      });

      logger.info(`[DEBUG] Final content:\n${content}`);
      return content;
    } catch (error) {
      logger.warn('[DEBUG] Failed to extract Prisma types from schema:', error);
      const importsStr = imports.join(', ');
      return content + `export type { ${importsStr} } from '@prisma/client';\n`;
    }
  }
}
