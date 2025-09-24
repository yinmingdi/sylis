import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, patterns } from '../config';
import { fileSystem } from '../utils/file-system';
import { logger } from '../utils/logger';
import { TypeHelper } from '../utils/type-helper';
import type { ModuleDtos, DtoInfo, DependencyAnalysisResult } from '../types';

/**
 * 文件管理器 - 负责索引文件的生成和管理
 */
export class FileManager {
  /**
   * 生成模块的 index.ts 文件
   */
  generateModuleIndex(moduleName: string, moduleDtos: DtoInfo[]): void {
    const moduleDir = config.getModuleOutputDir(moduleName);
    const indexPath = join(moduleDir, 'index.ts');

    let indexContent = '// Auto-generated module exports\n\n';

    // 导出DTO接口
    const dtoFiles = new Map<string, string[]>();
    moduleDtos.forEach(({ className, fileName }) => {
      const fileNameWithoutExt = fileName.replace('.ts', '');
      if (!dtoFiles.has(fileNameWithoutExt)) {
        dtoFiles.set(fileNameWithoutExt, []);
      }
      dtoFiles.get(fileNameWithoutExt)!.push(className);
    });

    // 生成导出语句
    dtoFiles.forEach((classNames, fileName) => {
      indexContent += TypeHelper.generateImportStatement(
        classNames,
        `./${fileName}`,
        true,
      );
    });

    // 导出类型文件
    const typesDir = config.getTypeOutputDir(moduleName);
    if (fileSystem.existsSync(typesDir)) {
      const typeFiles = fileSystem
        .readdirSync(typesDir)
        .filter((f) => f.endsWith('.ts'));

      if (typeFiles.length > 0) {
        indexContent += '\n// Type exports\n';
        typeFiles.forEach((typeFile) => {
          const typeFileName = typeFile.replace('.ts', '');
          indexContent += `export * from './types/${typeFileName}';\n`;
        });
      }
    }

    fileSystem.writeFileWithDir(indexPath, indexContent);
    logger.debug(`Generated module index: ${indexPath}`);
  }

  /**
   * 生成根目录的 index.ts 文件
   */
  generateRootIndex(): void {
    const rootIndexPath = join(config.sharedDtoDir, 'index.ts');
    let rootIndexContent = '// Auto-generated root exports\n\n';

    const modules = fileSystem.getSubDirectories(config.sharedDtoDir);

    modules.forEach((moduleName) => {
      const moduleIndexPath = join(config.sharedDtoDir, moduleName, 'index.ts');
      if (fileSystem.existsSync(moduleIndexPath)) {
        rootIndexContent += `export * from './${moduleName}';\n`;
      }
    });

    fileSystem.writeFileWithDir(rootIndexPath, rootIndexContent);
    logger.debug(`Generated root index: ${rootIndexPath}`);
  }

  /**
   * 生成文件头部导入语句
   */
  generateFileHeader(
    analysisResult: DependencyAnalysisResult,
    usedTypes: Set<string>,
  ): string {
    let content = '// Auto-generated shared DTO interface\n';
    content += '// This file includes all necessary type dependencies\n\n';

    const typeImports = this.collectTypeImports(analysisResult, usedTypes);

    // 生成导入语句
    typeImports.forEach((imports, fileName) => {
      if (imports.length > 0) {
        content += TypeHelper.generateImportStatement(
          imports,
          `./types/${fileName}`,
          true,
        );
      }
    });

    if (typeImports.size > 0) {
      content += '\n';
    }

    return content;
  }

  /**
   * 收集类型导入信息
   */
  private collectTypeImports(
    analysisResult: DependencyAnalysisResult,
    usedTypes: Set<string>,
  ): Map<string, string[]> {
    const typeImports = new Map<string, string[]>();

    for (const dependency of analysisResult.dependencies) {
      const usedImports = dependency.imports.filter((imp) =>
        usedTypes.has(imp),
      );

      if (usedImports.length === 0) continue;

      let fileName: string;

      if (dependency.isRelativeImport && dependency.isTypeFile) {
        fileName = TypeHelper.getFileNameFromPath(
          dependency.resolvedPath,
        ).replace('.ts', '');
      } else if (dependency.originalPath === '@prisma/client') {
        fileName = 'prisma.types';
      } else if (dependency.originalPath.includes('@sylis/')) {
        fileName = 'shared.types';
      } else {
        continue; // 跳过其他外部依赖
      }

      if (!typeImports.has(fileName)) {
        typeImports.set(fileName, []);
      }

      const existingImports = typeImports.get(fileName)!;
      usedImports.forEach((imp) => {
        if (!existingImports.includes(imp)) {
          existingImports.push(imp);
        }
      });
    }

    return typeImports;
  }

  /**
   * 删除共享 DTO 文件并重新生成相关索引
   */
  deleteSharedDto(dtoPath: string): void {
    // 提取模块信息
    const match = dtoPath.match(patterns.modulePath);
    if (!match) {
      logger.warn(`Invalid DTO path format: ${dtoPath}`);
      return;
    }

    const [, moduleName, fileName] = match;
    const sharedDtoPath = join(config.getModuleOutputDir(moduleName), fileName);

    logger.delete(`Attempting to delete shared DTO: ${sharedDtoPath}`);

    if (fileSystem.safeDeleteFile(sharedDtoPath)) {
      logger.delete(`Shared DTO deleted: ${sharedDtoPath}`);
      this.regenerateModuleIndex(moduleName);
    } else {
      logger.delete(`Shared DTO not found: ${sharedDtoPath}`);
    }
  }

  /**
   * 重新生成模块索引
   */
  private regenerateModuleIndex(moduleName: string): void {
    const moduleDir = config.getModuleOutputDir(moduleName);
    if (!fileSystem.existsSync(moduleDir)) return;

    const dtoFiles = fileSystem.getAllDtoFiles(moduleDir);
    const dtoInfos: DtoInfo[] = [];

    dtoFiles.forEach((filePath) => {
      const fileName = TypeHelper.getFileNameFromPath(filePath);
      const content = fileSystem.safeReadFile(filePath);

      if (content) {
        // 提取导出的接口名
        const interfaceMatches = content.matchAll(patterns.interfaceDefinition);
        for (const match of interfaceMatches) {
          const className = match[1];
          dtoInfos.push({ className, fileName });
        }
      }
    });

    this.generateModuleIndex(moduleName, dtoInfos);
    this.generateRootIndex();
  }

  /**
   * 清理生成的文件
   */
  cleanGeneratedFiles(moduleName?: string): void {
    if (moduleName) {
      const moduleDir = config.getModuleOutputDir(moduleName);
      if (fileSystem.existsSync(moduleDir)) {
        fileSystem.removeDirectory(moduleDir);
        logger.info(`Cleaned module: ${moduleName}`);
      }
    } else {
      if (fileSystem.existsSync(config.sharedDtoDir)) {
        fileSystem.clearDirectory(config.sharedDtoDir);
        logger.info('Cleaned all generated DTOs');
      }
    }
  }
}
