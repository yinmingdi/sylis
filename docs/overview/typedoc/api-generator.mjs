/* eslint-env node */
/* global console */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { Application } from "typedoc";

// 常量配置
const CONFIG = {
  PACKAGES_DIR: "./packages",
  APPS_DIR: "./apps",
  PACKAGE_JSON: "./package.json",
  TSCONFIG_JSON: "./tsconfig.json",
  ENTRY_POINT: "src/index.ts",
  APPS_ENTRY_PATTERN: "src",
  README: "none",
  NAVIGATION: {
    includeCategories: true,
    includeGroups: true,
    includeFolders: false,
  },
};

// TypeDoc 配置模板
const TYPEDOC_CONFIGS = {
  PACKAGE: {
    skipErrorChecking: true,
    excludeExternals: true,
    excludeInternal: true,
    excludePrivate: true,
    excludeProtected: true,
    disableSources: false,
    hideGenerator: true,
    includeVersion: true,
  },
  APP: {
    skipErrorChecking: true,
    excludeExternals: true,
    excludeInternal: true,
    excludePrivate: true,
    excludeProtected: true,
    disableSources: false,
    hideGenerator: true,
    includeVersion: true,
    excludeNotDocumented: false,
    intentionallyNotExported: ["*"],
    entryPointStrategy: "expand",
  },
};

/**
 * API文档生成器
 * 用于为 packages 和 apps 目录生成 TypeDoc 文档
 */
export class ApiGenerator {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.rootPath - 项目根路径
   * @param {string} options.outputPath - 输出路径
   */
  constructor(options) {
    this.rootPath = options.rootPath;
    this.outputPath = options.outputPath;
    this.packages = [];
    this.apps = [];

    // 内部使用的包信息数组，用于跟踪所有发现的包和应用
    this._packagesJSON = [];

    this._initializePaths();
    this._discoverPackages();
    this._discoverApps();
  }

  /**
   * 初始化路径配置
   * @private
   */
  _initializePaths() {
    this.packagesPath = resolve(this.rootPath, CONFIG.PACKAGES_DIR);
    this.appsPath = resolve(this.rootPath, CONFIG.APPS_DIR);
  }

  /**
   * 发现并处理 packages 目录
   * @private
   */
  _discoverPackages() {
    if (!existsSync(this.packagesPath)) {
      console.log("Packages directory not found, skipping...");
      return;
    }

    this.packages = this._scanDirectory(this.packagesPath, (pkg) => {
      return this._validatePackage(pkg, this.packagesPath, "package");
    });
  }

  /**
   * 发现并处理 apps 目录
   * @private
   */
  _discoverApps() {
    if (!existsSync(this.appsPath)) {
      console.log("Apps directory not found, skipping...");
      return;
    }

    this.apps = this._scanDirectory(this.appsPath, (app) => {
      return this._validateApp(app, this.appsPath);
    });
  }

  /**
   * 扫描目录并过滤有效项目
   * @param {string} dirPath - 目录路径
   * @param {Function} validator - 验证函数
   * @returns {Array} 有效的项目列表
   * @private
   */
  _scanDirectory(dirPath, validator) {
    return readdirSync(dirPath)
      .filter((item) => this._isValidDirectory(dirPath, item))
      .filter(validator);
  }

  /**
   * 检查是否为有效目录
   * @param {string} parentPath - 父目录路径
   * @param {string} item - 项目名称
   * @returns {boolean} 是否为有效目录
   * @private
   */
  _isValidDirectory(parentPath, item) {
    const itemPath = resolve(parentPath, item);
    return existsSync(itemPath) && statSync(itemPath).isDirectory();
  }

  /**
   * 验证 package 项目
   * @param {string} pkg - 包名
   * @param {string} basePath - 基础路径
   * @param {string} type - 项目类型
   * @returns {boolean} 是否有效
   * @private
   */
  _validatePackage(pkg, basePath, type) {
    const pkgJsonPath = resolve(basePath, pkg, CONFIG.PACKAGE_JSON);
    if (!existsSync(pkgJsonPath)) return false;

    try {
      const pkgJson = this._readPackageJson(pkgJsonPath);
      const pkgJsonParsed = this._parsePackageJson(pkgJson, pkg, type);

      const hasTsconfig = existsSync(
        resolve(basePath, pkg, CONFIG.TSCONFIG_JSON),
      );

      // 检查入口点：优先检查标准入口点，如果没有则检查多入口点
      const hasStandardEntryPoint = existsSync(
        resolve(basePath, pkg, CONFIG.ENTRY_POINT),
      );
      const hasMultipleEntryPoints = this._checkMultipleEntryPoints(
        basePath,
        pkg,
        pkgJsonParsed,
      );

      if (!hasTsconfig || (!hasStandardEntryPoint && !hasMultipleEntryPoints))
        return false;

      // 对于 packages，跳过私有包
      if (type === "package" && pkgJsonParsed.private) {
        return false;
      }

      // 标记包是否有多个入口点
      pkgJsonParsed.hasMultipleEntryPoints =
        hasMultipleEntryPoints && !hasStandardEntryPoint;

      this._packagesJSON.push(pkgJsonParsed);
      return true;
    } catch (error) {
      console.warn(`Failed to validate package ${pkg}:`, error.message);
      return false;
    }
  }

  /**
   * 验证 app 项目
   * @param {string} app - 应用名
   * @param {string} basePath - 基础路径
   * @returns {boolean} 是否有效
   * @private
   */
  _validateApp(app, basePath) {
    const appJsonPath = resolve(basePath, app, CONFIG.PACKAGE_JSON);
    if (!existsSync(appJsonPath)) return false;

    try {
      const appJson = this._readPackageJson(appJsonPath);
      const appJsonParsed = this._parsePackageJson(appJson, app, "app");

      const hasTsconfig = existsSync(
        resolve(basePath, app, CONFIG.TSCONFIG_JSON),
      );
      const hasEntryPoint = this._checkAppEntryPoints(basePath, app);

      if (!hasTsconfig || !hasEntryPoint) return false;

      this._packagesJSON.push(appJsonParsed);
      return true;
    } catch (error) {
      console.warn(`Failed to validate app ${app}:`, error.message);
      return false;
    }
  }

  /**
   * 检查 app 的入口点
   * @param {string} basePath - 基础路径
   * @param {string} app - 应用名
   * @returns {boolean} 是否有有效入口点
   * @private
   */
  _checkAppEntryPoints(basePath, app) {
    const entryPoints = [
      resolve(basePath, app, "src/main.ts"),
      resolve(basePath, app, "src/main.tsx"),
      resolve(basePath, app, "src/index.ts"),
    ];

    return entryPoints.some((entryPoint) => existsSync(entryPoint));
  }

  /**
   * 检查包的多入口点（基于 package.json 的 exports 字段）
   * @param {string} basePath - 基础路径
   * @param {string} pkg - 包名
   * @param {Object} pkgJsonParsed - 解析后的 package.json
   * @returns {boolean} 是否有有效的多入口点
   * @private
   */
  _checkMultipleEntryPoints(basePath, pkg, pkgJsonParsed) {
    if (!pkgJsonParsed.exports) return false;

    const pkgPath = resolve(basePath, pkg);
    const exports = pkgJsonParsed.exports;

    // 检查每个导出路径是否存在对应的文件或目录
    const validEntryPoints = [];
    for (const [exportKey, exportPath] of Object.entries(exports)) {
      if (typeof exportPath === "string") {
        let isValid = false;

        if (exportPath.endsWith("/*")) {
          // 检查目录导出
          const dirPath = resolve(pkgPath, exportPath.replace("/*", ""));
          isValid = existsSync(dirPath);
        } else {
          // 检查文件导出
          const fullPath = resolve(pkgPath, exportPath);
          isValid = existsSync(fullPath);
        }

        if (isValid) {
          validEntryPoints.push({
            key: exportKey,
            path: exportPath,
            fullPath: exportPath.endsWith("/*")
              ? resolve(pkgPath, exportPath.replace("/*", ""))
              : resolve(pkgPath, exportPath),
          });
        }
      }
    }

    // 至少有一个有效的入口点
    return validEntryPoints.length > 0;
  }

  /**
   * 读取 package.json 文件
   * @param {string} path - 文件路径
   * @returns {string} 文件内容
   * @private
   */
  _readPackageJson(path) {
    return readFileSync(path, "utf8");
  }

  /**
   * 解析 package.json 并添加元数据
   * @param {string} jsonContent - JSON 内容
   * @param {string} name - 项目名称
   * @param {string} type - 项目类型
   * @returns {Object} 解析后的包信息
   * @private
   */
  _parsePackageJson(jsonContent, name, type) {
    const parsed = JSON.parse(jsonContent);
    parsed.pathName = name;
    parsed.type = type;
    return parsed;
  }

  /**
   * 清理输出目录
   */
  cleanOutput() {
    try {
      if (existsSync(this.outputPath)) {
        rmSync(this.outputPath, { recursive: true });
        console.log(`Cleaned output directory: ${this.outputPath}`);
      }
      mkdirSync(this.outputPath, { recursive: true });
    } catch (error) {
      console.error("Failed to clean output directory:", error.message);
      throw error;
    }
  }

  /**
   * 生成所有文档
   */
  async generateDocs() {
    console.log("Starting documentation generation...");

    try {
      const failures = [
        ...(await this._generatePackageDocs()),
        ...(await this._generateAppDocs()),
      ];
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `TypeDoc failed for ${failures.length} project(s).`,
        );
      }
      await this._generateIndexFile();
      console.log("Documentation generation completed successfully!");
    } catch (error) {
      console.error("Documentation generation failed:", error.message);
      throw error;
    }
  }

  /**
   * 生成 packages 文档
   * @private
   */
  async _generatePackageDocs() {
    const failures = [];
    if (this.packages.length === 0) {
      console.log("No packages found, skipping package documentation...");
      return failures;
    }

    console.log(
      `Generating documentation for ${this.packages.length} packages...`,
    );

    for (const pkg of this.packages) {
      try {
        await this._generateSingleDoc(pkg, this.packagesPath, "package");
        console.log(`✓ Generated docs for package: ${pkg}`);
      } catch (error) {
        failures.push(
          new Error(`Package ${pkg}: ${error.message}`, { cause: error }),
        );
        console.error(
          `✗ Failed to generate docs for package ${pkg}:`,
          error.message,
        );
      }
    }
    return failures;
  }

  /**
   * 生成 apps 文档
   * @private
   */
  async _generateAppDocs() {
    const failures = [];
    if (this.apps.length === 0) {
      console.log("No apps found, skipping app documentation...");
      return failures;
    }

    console.log(`Generating documentation for ${this.apps.length} apps...`);

    for (const appName of this.apps) {
      try {
        await this._generateSingleDoc(appName, this.appsPath, "app");
        console.log(`✓ Generated docs for app: ${appName}`);
      } catch (error) {
        failures.push(
          new Error(`Application ${appName}: ${error.message}`, {
            cause: error,
          }),
        );
        console.error(
          `✗ Failed to generate docs for app ${appName}:`,
          error.message,
        );
      }
    }
    return failures;
  }

  /**
   * 生成单个项目的文档
   * @param {string} name - 项目名称
   * @param {string} basePath - 基础路径
   * @param {string} type - 项目类型
   * @private
   */
  async _generateSingleDoc(name, basePath, type) {
    const config = this._createTypedocConfig(name, basePath, type);
    const app = await Application.bootstrapWithPlugins(config);

    // shared 仍需包含未显式标注文档的公开声明。
    if (name === "shared") {
      app.options.setValue("excludeNotDocumented", false);
    }

    const project = await app.convert();

    console.log(
      `Generating docs for ${name} using theme: ${app.options.getValue("theme")}`,
    );
    console.log(`Output path: ${config.out}`);

    if (!project) {
      throw new Error("TypeDoc conversion failed; no project was generated.");
    }
    await app.generateOutputs(project);
    if (!existsSync(resolve(config.out, "index.md"))) {
      throw new Error("TypeDoc did not generate an index.md entry page.");
    }
  }

  /**
   * 创建 TypeDoc 配置
   * @param {string} name - 项目名称
   * @param {string} basePath - 基础路径
   * @param {string} type - 项目类型
   * @returns {Object} TypeDoc 配置
   * @private
   */
  _createTypedocConfig(name, basePath, type) {
    const isApp = type === "app";
    const baseConfig = isApp ? TYPEDOC_CONFIGS.APP : TYPEDOC_CONFIGS.PACKAGE;
    const outputPath = resolve(this.outputPath, name);

    // 获取包信息以检查是否为多入口点包
    const pkgInfo = this._packagesJSON.find((p) => p.pathName === name);
    const hasMultipleEntryPoints = pkgInfo?.hasMultipleEntryPoints || false;

    let entryPoints;
    let entryPointStrategy = "resolve";

    if (isApp) {
      entryPoints = resolve(basePath, name, CONFIG.APPS_ENTRY_PATTERN);
      entryPointStrategy = "expand";
    } else if (hasMultipleEntryPoints) {
      // 对于多入口点包，使用有效的导出文件作为入口点
      entryPoints = this._getMultipleEntryPoints(basePath, name, pkgInfo);
      entryPointStrategy = "resolve";
    } else {
      entryPoints = resolve(basePath, name, CONFIG.ENTRY_POINT);
    }

    console.log(`Entry points for ${name}:`, entryPoints);

    const config = {
      entryPoints,
      entryPointStrategy,
      tsconfig: resolve(basePath, name, CONFIG.TSCONFIG_JSON),
      name: `@sylis/${name}`,
      readme: CONFIG.README,
      navigation: CONFIG.NAVIGATION,
      titleLink: CONFIG.TITLE_LINK,
      theme: "markdown",
      plugin: ["typedoc-plugin-markdown"],
      entryFileName: "index",
      out: outputPath,
      // 排除配置文件和构建产物
      exclude: [
        "**/node_modules/**",
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/*.config.*",
        "**/*.d.ts",
        "**/dist/**",
        resolve(basePath, name, "tsdown.config.ts"),
      ],
      ...baseConfig,
    };

    return config;
  }

  /**
   * 获取多入口点包的所有入口点
   * @param {string} basePath - 基础路径
   * @param {string} name - 包名
   * @param {Object} pkgInfo - 包信息
   * @returns {Array} 入口点数组
   * @private
   */
  _getMultipleEntryPoints(basePath, name, pkgInfo) {
    const pkgPath = resolve(basePath, name);
    const entryPoints = [];

    if (pkgInfo.exports) {
      for (const [, exportPath] of Object.entries(pkgInfo.exports)) {
        if (typeof exportPath === "string") {
          // 对于目录导出（如 configs/*），添加目录中的所有 TypeScript 文件
          if (exportPath.endsWith("/*")) {
            const dirPath = resolve(pkgPath, exportPath.replace("/*", ""));
            if (existsSync(dirPath)) {
              // 查找目录中的所有 .ts 文件
              const files = readdirSync(dirPath).filter(
                (file) => file.endsWith(".ts") && !file.endsWith(".d.ts"),
              );
              files.forEach((file) => {
                entryPoints.push(resolve(dirPath, file));
              });
            }
          } else {
            // 对于具体文件导出，添加文件
            const fullPath = resolve(pkgPath, exportPath);
            if (existsSync(fullPath)) {
              entryPoints.push(fullPath);
            }
          }
        }
      }
    }

    return entryPoints;
  }

  /**
   * 生成动态 index.md 文件
   * @private
   */
  async _generateIndexFile() {
    console.log("Generating index.md...");

    const indexContent = this._createIndexContent();
    const indexPath = resolve(this.outputPath, "index.md");

    try {
      writeFileSync(indexPath, indexContent, "utf8");
      console.log(`✓ Generated index.md at: ${indexPath}`);
    } catch (error) {
      console.error("Failed to generate index.md:", error.message);
      throw error;
    }
  }

  /**
   * 创建 index.md 内容
   * @returns {string} index.md 内容
   * @private
   */
  _createIndexContent() {
    const packagesSection = this._generatePackagesSection();
    const appsSection = this._generateAppsSection();

    return `# Sylis API Documentation

欢迎来到 Sylis 英语学习应用的 API 文档中心。这里包含了所有包和应用的详细 API 文档。

## 📦 Packages

${packagesSection}

## 🚀 Applications

${appsSection}

---

> 📝 本文档由 TypeDoc 自动生成，最后更新时间: ${new Date().toLocaleString("zh-CN")}
`;
  }

  /**
   * 生成 Packages 部分
   * @returns {string} Packages 部分内容
   * @private
   */
  _generatePackagesSection() {
    const generatedPackages = this._generatedProjects(this.packages);
    if (generatedPackages.length === 0) {
      return "暂无 packages 文档。";
    }

    const packageItems = generatedPackages
      .map((pkg) => {
        const pkgInfo = this._packagesJSON.find((p) => p.pathName === pkg);
        const description = pkgInfo?.description || "暂无描述";
        const version = pkgInfo?.version || "1.0.0";

        return `### [@sylis/${pkg}](./${pkg}/index.md)
- **版本**: ${version}
- **描述**: ${description}
- **路径**: \`packages/${pkg}\``;
      })
      .join("\n\n");

    return `以下是所有可用的 packages：

${packageItems}`;
  }

  /**
   * 生成 Applications 部分
   * @returns {string} Applications 部分内容
   * @private
   */
  _generateAppsSection() {
    const generatedApps = this._generatedProjects(this.apps);
    if (generatedApps.length === 0) {
      return "暂无 applications 文档。";
    }

    const appItems = generatedApps
      .map((app) => {
        const appInfo = this._packagesJSON.find((p) => p.pathName === app);
        const description = appInfo?.description || "暂无描述";
        const version = appInfo?.version || "1.0.0";

        return `### [@sylis/${app}](./${app}/index.md)
- **版本**: ${version}
- **描述**: ${description}
- **路径**: \`apps/${app}\``;
      })
      .join("\n\n");

    return `以下是所有可用的 applications：

${appItems}`;
  }

  /**
   * 只返回实际生成了入口页的项目，避免总索引产生死链接。
   * @param {string[]} projects - 已发现的项目名称
   * @returns {string[]} 已生成入口页的项目名称
   * @private
   */
  _generatedProjects(projects) {
    return projects.filter((name) =>
      existsSync(resolve(this.outputPath, name, "index.md")),
    );
  }
}
