import * as chokidar from "chokidar";
import { join } from "node:path";

import { generateDtos, deleteSharedDto } from "./utils";

/**
 * 监听 DTO 文件变化并自动生成共享 DTO
 */
export class DtoWatcher {
  private watcher: chokidar.FSWatcher;

  constructor() {
    const watchPath = join(__dirname, "../src/modules/");
    this.watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.setupEventHandlers();
    console.log(`👀 Watching DTO files: ${watchPath}`);
  }

  private setupEventHandlers(): void {
    this.watcher.on("add", this.handleFileAdd.bind(this));
    this.watcher.on("change", this.handleFileChange.bind(this));
    this.watcher.on("unlink", this.handleFileDelete.bind(this));
  }

  private handleFileAdd(path: string): void {
    if (path.endsWith(".dto.ts")) {
      console.log(`📝 [watch] DTO file added: ${path}`);
      generateDtos([path]);
    }
  }

  private handleFileChange(path: string): void {
    if (path.endsWith(".dto.ts")) {
      console.log(`📝 [watch] DTO file changed: ${path}`);
      generateDtos([path]);
    }
  }

  private handleFileDelete(path: string): void {
    if (path.endsWith(".dto.ts")) {
      console.log(`🗑️ [watch] DTO file deleted: ${path}`);
      deleteSharedDto(path);
    }
  }

  public close(): void {
    this.watcher.close();
    console.log("👋 DTO watcher stopped");
  }
}
