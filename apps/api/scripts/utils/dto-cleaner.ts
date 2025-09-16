import { config, patterns } from '../config';
import { fs, getAllDtoFiles, safeDeleteFile } from './file-utils';

/**
 * 删除共享 DTO 文件并重新生成相关索引
 */
export function deleteSharedDto(dtoPath: string, fileSystem = fs): void {
  // dtoPath: 绝对路径，如 apps/api/src/modules/user/dto/createUser.dto.ts
  // 目标: 删除 packages/shared/dto/user/createUser.dto.ts
  const relative = dtoPath.replace(/\\/g, '/').replace(/^.*\/modules\//, ''); // user/dto/createUser.dto.ts
  const moduleAndFile = relative.replace('/dto/', '/'); // user/createUser.dto.ts
  const sharedDtoPath = fileSystem.join(config.sharedDtoDir, moduleAndFile);

  console.log(`[delete] Attempting to delete shared DTO: ${sharedDtoPath}`);

  if (safeDeleteFile(sharedDtoPath, fileSystem)) {
    console.log(`[delete] Shared DTO deleted: ${sharedDtoPath}`);

    // 重新生成模块的 index.ts 文件
    const moduleName = moduleAndFile.split('/')[0];
    regenerateModuleIndex(moduleName, fileSystem);
  } else {
    console.log(`[delete] Shared DTO not found: ${sharedDtoPath}`);
  }
}

/**
 * 重新生成模块的 index.ts 文件
 */
function regenerateModuleIndex(moduleName: string, fileSystem = fs): void {
  const moduleDir = fileSystem.join(config.sharedDtoDir, moduleName);
  if (!fileSystem.existsSync(moduleDir)) return;

  const dtoFiles = getAllDtoFiles(moduleDir, fileSystem);
  const dtoInfos: Array<{ className: string; fileName: string }> = [];

  dtoFiles.forEach((filePath) => {
    const fileName = filePath.split('/').pop()?.replace('.dto.ts', '');
    if (fileName) {
      // 将文件名转换为类名（首字母大写）
      const className = fileName.charAt(0).toUpperCase() + fileName.slice(1) + 'Dto';
      dtoInfos.push({ className, fileName: fileName + '.dto.ts' });
    }
  });

  const moduleIndexPath = fileSystem.join(moduleDir, 'index.ts');
  let indexContent = '// Auto-generated module exports\n\n';

  dtoInfos.forEach(({ className, fileName }) => {
    indexContent += `export type { ${className} } from './${fileName.replace('.ts', '')}';\n`;
  });

  fileSystem.writeFileSync(moduleIndexPath, indexContent, 'utf-8');
  console.log(`[delete] Regenerated module index: ${moduleIndexPath}`);

  // 重新生成根目录的 index.ts
  regenerateRootIndex(fileSystem);
}

/**
 * 重新生成根目录的 index.ts 文件
 */
function regenerateRootIndex(fileSystem = fs): void {
  const modules = fileSystem.readdirSync(config.sharedDtoDir).filter((item) => {
    const itemPath = fileSystem.join(config.sharedDtoDir, item);
    return fileSystem.statSync(itemPath).isDirectory();
  });

  let rootIndexContent = '// Auto-generated root exports\n\n';

  modules.forEach((moduleName) => {
    const moduleIndexPath = fileSystem.join(config.sharedDtoDir, moduleName, 'index.ts');
    if (fileSystem.existsSync(moduleIndexPath)) {
      const moduleContent = fileSystem.readFileSync(moduleIndexPath, 'utf-8');
      const exports = moduleContent.match(patterns.exportType);
      if (exports) {
        exports.forEach((exportLine) => {
          const className = exportLine.match(/export type \{ ([^}]+) \} from/)?.[1];
          if (className) {
            rootIndexContent += `export type { ${className} } from './${moduleName}';\n`;
          }
        });
      }
    }
  });

  const rootIndexPath = fileSystem.join(config.sharedDtoDir, 'index.ts');
  fileSystem.writeFileSync(rootIndexPath, rootIndexContent, 'utf-8');
  console.log(`[delete] Regenerated root index: ${rootIndexPath}`);
}
