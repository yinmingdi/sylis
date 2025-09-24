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
    const content = this.generateExternalTypeContent(dependency);
    fileSystem.writeFileWithDir(outputPath, content);

    logger.debug(`Generated external types: ${outputPath}`);
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
    let content = '// Auto-generated external type definitions\n';
    content += `// Source: ${dependency.originalPath}\n\n`;

    if (dependency.imports.length > 0) {
      dependency.imports.forEach((importName) => {
        content += `export type ${importName} = any; // TODO: Extract actual type\n`;
      });
    }

    return content;
  }
}
