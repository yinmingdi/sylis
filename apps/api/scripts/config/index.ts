import { join } from "node:path";

export const config = {
  backendDtoDir: join(__dirname, "../../src/modules"), // 后端 DTO 目录
  sharedDtoDir: join(__dirname, "../../../../packages/shared/dto"), // 共享 DTO 输出目录
  tsConfigPath: join(__dirname, "../../tsconfig.json"), // TypeScript 配置文件路径
};

export const patterns = {
  modulePath: /modules\/(.*?)\/dto\/(.*?\.dto\.ts)$/, // 模块路径匹配模式
  exportType: /export type \{ ([^}]+) \} from/g, // 导出类型匹配模式
};
