import { writeFileSync } from 'fs';
import { join } from 'path';
import { Project, ClassDeclaration, PropertyDeclaration, SourceFile } from 'ts-morph';

import { config, patterns } from '../config';
import { fs, ensureDir, getAllDtoFiles } from './file-utils';

export interface DtoInfo {
  className: string;
  fileName: string;
}

export interface ModuleDtos {
  [moduleName: string]: DtoInfo[];
}

/**
 * 从 TypeScript 类生成 DTO 接口内容
 */
function generateDtoInterface(cls: ClassDeclaration): string {
  const className = cls.getName();
  if (!className) return '';

  let content = `export interface ${className} {\n`;
  const properties = cls.getProperties();

  properties.forEach((prop: PropertyDeclaration) => {
    const propName = prop.getName();
    const propType = prop.getTypeNode()?.getText() ?? 'any';
    content += `  ${propName}: ${propType};\n`;
  });

  content += '}\n\n';
  return content;
}

/**
 * 生成单个 DTO 文件
 */
function generateDtoFile(sourceFile: SourceFile, moduleDtos: ModuleDtos, fileSystem = fs): void {
  const classes = sourceFile.getClasses().filter((c: ClassDeclaration) => c.isExported());
  if (classes.length === 0) return;

  const relPath = sourceFile.getFilePath().replace(/\\/g, '/');
  const match = relPath.match(patterns.modulePath);
  if (!match) return;

  const moduleName = match[1];
  const fileName = match[2]; // 保持原始文件名，如 register.dto.ts
  const outputDir = fileSystem.join(config.sharedDtoDir, moduleName);

  ensureDir(outputDir, fileSystem);
  const outputFile = fileSystem.join(outputDir, fileName);

  // 记录该模块的 DTO 信息
  if (!moduleDtos[moduleName]) {
    moduleDtos[moduleName] = [];
  }

  let outputContent = '// Auto-generated shared DTO interface\n\n';

  classes.forEach((cls: ClassDeclaration) => {
    const className = cls.getName();
    if (!className) return;

    moduleDtos[moduleName].push({ className, fileName });
    outputContent += generateDtoInterface(cls);
  });

  fileSystem.writeFileSync(outputFile, outputContent, 'utf-8');
  console.log(`Generated shared DTO interface at ${outputFile}`);
}

/**
 * 生成模块的 index.ts 文件（全量覆盖，支持多个导出，递归查找 .dto.ts 文件）
 */
function generateModuleIndex(moduleDir: string, project: Project) {
  const dtoFiles = getAllDtoFiles(moduleDir).filter((f) => f.endsWith('.dto.ts'));
  let indexContent = '// Auto-generated module exports\n\n';

  dtoFiles.forEach((filePath) => {
    const sourceFile = project.addSourceFileAtPathIfExists(filePath);
    if (!sourceFile) return;
    // 导出所有导出的 class/interface
    sourceFile.getClasses().forEach((cls) => {
      if (cls.isExported() && cls.getName()) {
        indexContent += `export type { ${cls.getName()} } from './${filePath.replace(moduleDir + '/', '').replace('.ts', '')}';\n`;
      }
    });
    sourceFile.getInterfaces().forEach((intf) => {
      if (intf.isExported() && intf.getName()) {
        indexContent += `export type { ${intf.getName()} } from './${filePath.replace(moduleDir + '/', '').replace('.ts', '')}';\n`;
      }
    });
  });

  writeFileSync(join(moduleDir, 'index.ts'), indexContent, 'utf-8');
}

/**
 * 生成根目录的 index.ts 文件，递归扫描所有模块目录
 */
function generateRootIndexByScan(fileSystem = fs): void {
  const rootIndexPath = fileSystem.join(config.sharedDtoDir, 'index.ts');
  let rootIndexContent = '// Auto-generated root exports\n\n';

  // 递归扫描所有一级子目录（模块）
  const modules = fileSystem
    .readdirSync(config.sharedDtoDir)
    .filter((name) =>
      fileSystem.statSync(fileSystem.join(config.sharedDtoDir, name)).isDirectory(),
    );

  modules.forEach((moduleName) => {
    // 只导出存在index.ts的模块
    const moduleIndex = fileSystem.join(config.sharedDtoDir, moduleName, 'index.ts');
    if (fileSystem.existsSync(moduleIndex)) {
      rootIndexContent += `export * from './${moduleName}';\n`;
    }
  });

  fileSystem.writeFileSync(rootIndexPath, rootIndexContent, 'utf-8');
  console.log(`Generated root index at ${rootIndexPath}`);
}

/**
 * 生成所有 DTO 文件
 */
export function generateDtos(files: string[], fileSystem = fs): void {
  const project = new Project({
    tsConfigFilePath: config.tsConfigPath,
  });

  const sourceFiles = project.addSourceFilesAtPaths(files);
  const moduleDtos: ModuleDtos = {};

  // 生成 DTO 文件
  sourceFiles.forEach((sourceFile) => {
    generateDtoFile(sourceFile, moduleDtos, fileSystem);
  });

  // 生成模块的 index.ts 文件
  Object.keys(moduleDtos).forEach((moduleName) => {
    generateModuleIndex(join(config.sharedDtoDir, moduleName), project);
  });

  // 生成根目录的 index.ts 文件（改为递归扫描所有模块目录）
  generateRootIndexByScan(fileSystem);
}
