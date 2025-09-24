import { Project, ClassDeclaration, SourceFile } from 'ts-morph';
import { config, patterns } from '../config';
import { fileSystem } from '../utils/file-system';
import { logger } from '../utils/logger';
import { TypeHelper } from '../utils/type-helper';
import { DependencyAnalyzer } from './dependency-analyzer';
import { FileManager } from './file-manager';
import type {
  ModuleDtos,
  DtoInfo,
  GenerationOptions,
  DependencyAnalysisResult,
} from '../types';

/**
 * 核心DTO生成器
 */
export class DtoGenerator {
  private project: Project;
  private dependencyAnalyzer: DependencyAnalyzer;
  private fileManager: FileManager;

  constructor() {
    this.project = new Project({
      tsConfigFilePath: config.tsConfigPath,
    });
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.fileManager = new FileManager();
  }

  /**
   * 生成所有 DTO 文件
   */
  async generateDtos(
    files: string[],
    options: GenerationOptions = {},
  ): Promise<void> {
    const {
      includeDependencies = true,
      generateIndexes = true,
      cleanOldFiles = false,
    } = options;

    logger.section('Starting DTO Generation');

    if (cleanOldFiles) {
      this.fileManager.cleanGeneratedFiles();
    }

    const sourceFiles = this.project.addSourceFilesAtPaths(files);
    const moduleDtos: ModuleDtos = {};

    logger.info(`Found ${sourceFiles.length} DTO files to process`);

    // 生成 DTO 文件
    for (let i = 0; i < sourceFiles.length; i++) {
      const sourceFile = sourceFiles[i];
      logger.progress('Processing DTO files', i + 1, sourceFiles.length);

      await this.generateSingleDto(sourceFile, moduleDtos, includeDependencies);
    }

    if (generateIndexes) {
      logger.info('Generating index files');
      this.generateIndexFiles(moduleDtos);
    }

    logger.done('DTO generation completed successfully!');
  }

  /**
   * 生成单个 DTO 文件
   */
  private async generateSingleDto(
    sourceFile: SourceFile,
    moduleDtos: ModuleDtos,
    includeDependencies: boolean,
  ): Promise<void> {
    const classes = sourceFile.getClasses().filter((c) => c.isExported());
    const interfaces = sourceFile.getInterfaces().filter((i) => i.isExported());

    if (classes.length === 0 && interfaces.length === 0) {
      return;
    }

    const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
    const match = filePath.match(patterns.modulePath);
    if (!match) {
      logger.warn(`File path does not match expected pattern: ${filePath}`);
      return;
    }

    const moduleName = match[1];
    const fileName = match[2];
    const outputPath = fileSystem.join(
      config.getModuleOutputDir(moduleName),
      fileName,
    );

    // 分析依赖
    let analysisResult: DependencyAnalysisResult | null = null;
    if (includeDependencies) {
      try {
        analysisResult = this.dependencyAnalyzer.analyzeDependencies(filePath);
        await this.dependencyAnalyzer.generateDependencies(analysisResult);
      } catch (error) {
        logger.warn(`Failed to analyze dependencies for ${fileName}:`, error);
      }
    }

    // 记录模块DTO信息
    if (!moduleDtos[moduleName]) {
      moduleDtos[moduleName] = [];
    }

    // 生成文件内容
    const usedTypes = new Set<string>();
    let content = this.generateFileContent(
      classes,
      interfaces,
      analysisResult,
      usedTypes,
      moduleDtos[moduleName],
      fileName,
    );

    // 写入文件
    fileSystem.writeFileWithDir(outputPath, content);
    logger.generate(`Generated DTO: ${outputPath}`);
  }

  /**
   * 生成文件内容
   */
  private generateFileContent(
    classes: ClassDeclaration[],
    interfaces: any[],
    analysisResult: DependencyAnalysisResult | null,
    usedTypes: Set<string>,
    moduleDtos: DtoInfo[],
    fileName: string,
  ): string {
    // 第一遍：收集所有使用的类型
    classes.forEach((cls) => {
      TypeHelper.generateInterfaceFromClass(cls, usedTypes);
    });
    interfaces.forEach((intf) => {
      TypeHelper.generateInterfaceFromInterface(intf, usedTypes);
    });

    // 生成文件头部
    let content = analysisResult
      ? this.fileManager.generateFileHeader(analysisResult, usedTypes)
      : '// Auto-generated shared DTO interface\n\n';

    // 生成接口内容
    classes.forEach((cls) => {
      const className = cls.getName();
      if (className) {
        moduleDtos.push({ className, fileName });
        content += TypeHelper.generateInterfaceFromClass(cls, usedTypes);
      }
    });

    interfaces.forEach((intf) => {
      const interfaceName = intf.getName();
      if (interfaceName) {
        moduleDtos.push({ className: interfaceName, fileName });
        content += TypeHelper.generateInterfaceFromInterface(intf, usedTypes);
      }
    });

    return content;
  }

  /**
   * 生成索引文件
   */
  private generateIndexFiles(moduleDtos: ModuleDtos): void {
    // 生成模块索引
    Object.entries(moduleDtos).forEach(([moduleName, dtos]) => {
      this.fileManager.generateModuleIndex(moduleName, dtos);
    });

    // 生成根索引
    this.fileManager.generateRootIndex();
  }

  /**
   * 删除DTO文件
   */
  deleteDto(dtoPath: string): void {
    this.fileManager.deleteSharedDto(dtoPath);
  }

  /**
   * 清理生成的文件
   */
  clean(moduleName?: string): void {
    this.fileManager.cleanGeneratedFiles(moduleName);
  }
}
