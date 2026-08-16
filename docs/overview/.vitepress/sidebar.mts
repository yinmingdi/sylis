import { readdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apisPath = resolve(__dirname, "../apis");

export function getGuideSidebar() {
  return [
    {
      text: "指南",
      items: [
        { text: "什么是 Sylis", link: "/guide/what-is-sylis" },
        { text: "快速开始", link: "/guide/quick-start" },
        { text: "安装指南", link: "/guide/installation" },
        { text: "环境配置", link: "/guide/configuration" },
        { text: "系统架构", link: "/guide/architecture" },
        { text: "Harness Engineering", link: "/guide/harness-engineering" },
        { text: "词典与学习架构", link: "/guide/lexicon-architecture" },
        { text: "开发规范", link: "/guide/standards" },
        { text: "贡献指南", link: "/guide/contribution" },
        { text: "故障排除", link: "/guide/troubleshooting" },
        { text: "GitFlow 工作流", link: "/guide/gitflow" },
      ],
    },
  ];
}

export function getRefactorSidebar() {
  return [
    {
      text: "绿地重构",
      items: [{ text: "总览与文档地图", link: "/refactor/" }],
    },
    {
      text: "架构",
      collapsed: false,
      items: [
        { text: "目标系统架构", link: "/refactor/architecture/system" },
        {
          text: "Learning Agent",
          link: "/refactor/architecture/learning-agent-system",
        },
        {
          text: "Agent 会话 Block",
          link: "/refactor/architecture/agent-conversation-blocks",
        },
        { text: "Model Gateway", link: "/refactor/architecture/model-gateway" },
        {
          text: "凭证与密钥管理",
          link: "/refactor/architecture/credential-management",
        },
        {
          text: "文件与模型交换",
          link: "/refactor/architecture/agent-files-and-exchanges",
        },
        {
          text: "Bounded Contexts",
          link: "/refactor/architecture/bounded-contexts",
        },
        { text: "算法注册表", link: "/refactor/architecture/algorithms" },
        {
          text: "Job 与执行协议",
          link: "/refactor/architecture/background-jobs",
        },
        { text: "标准与设计依据", link: "/refactor/architecture/standards" },
      ],
    },
    {
      text: "数据",
      collapsed: false,
      items: [
        { text: "关系表结构", link: "/refactor/data/relational-schema" },
        { text: "单一标准 JSON", link: "/refactor/data/standard-json" },
        {
          text: "Artifact 与数据库映射",
          link: "/refactor/data/artifact-database-mapping",
        },
        { text: "来源、证据与权利", link: "/refactor/data/provenance" },
      ],
    },
    {
      text: "构建与发布",
      collapsed: false,
      items: [
        {
          text: "Lexicon Compiler",
          link: "/refactor/pipeline/lexicon-compiler",
        },
        { text: "AI Enrichment", link: "/refactor/pipeline/ai-enrichment" },
        {
          text: "Artifact 与 Release",
          link: "/refactor/pipeline/import-release",
        },
      ],
    },
    {
      text: "产品",
      collapsed: false,
      items: [
        {
          text: "学习、题库与测试",
          link: "/refactor/product/learning-assessment",
        },
        {
          text: "身份与独立用户",
          link: "/refactor/product/identity-user",
        },
        {
          text: "Reading Core 与内容体验",
          link: "/refactor/product/reading-experiences",
        },
        { text: "Learning Agent", link: "/refactor/product/learning-agent" },
        { text: "独立 Admin", link: "/refactor/product/admin" },
        { text: "API 重构", link: "/refactor/product/api" },
        { text: "Web 重构", link: "/refactor/product/web" },
      ],
    },
    {
      text: "实施映射",
      collapsed: false,
      items: [
        {
          text: "前端目录与模块边界",
          link: "/refactor/implementation/frontend-structure",
        },
        {
          text: "后端目录与 NestJS 边界",
          link: "/refactor/implementation/backend-structure",
        },
        {
          text: "Workspace 与 Turbo 治理",
          link: "/refactor/implementation/workspace-projects",
        },
        {
          text: "当前代码重构映射",
          link: "/refactor/implementation/workspace-refactor",
        },
        {
          text: "要求覆盖矩阵",
          link: "/refactor/implementation/coverage-matrix",
        },
      ],
    },
    {
      text: "交付",
      collapsed: false,
      items: [
        { text: "迁移与删除", link: "/refactor/delivery/migration" },
        { text: "测试与验收", link: "/refactor/delivery/testing" },
        {
          text: "CI/CD、Railway 与密钥",
          link: "/refactor/delivery/cicd-security",
        },
      ],
    },
  ];
}

export function getApiSidebar() {
  if (!statSync(apisPath, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  const apiProjects = readdirSync(apisPath).filter((item) => {
    const itemPath = resolve(apisPath, item);
    return statSync(itemPath).isDirectory();
  });

  // 将每个项目作为独立的顶级项目
  const apiItems = apiProjects.map((project) => {
    const projectItems = generateProjectSidebar(project);
    return projectItems;
  });

  return apiItems;
}

function generateProjectSidebar(projectName: string) {
  const projectPath = resolve(apisPath, projectName);

  // 递归生成项目内部的所有页面结构
  const projectItems = generateDirectorySidebar(projectPath, projectName);

  // 检查项目根目录是否有 index.md 文件
  const projectIndexPath = resolve(projectPath, "index.md");
  const hasProjectIndex = statSync(projectIndexPath, {
    throwIfNoEntry: false,
  })?.isFile();

  return {
    text: projectName,
    collapsed: true,
    link: hasProjectIndex ? `/apis/${projectName}/` : undefined,
    items: projectItems,
  };
}

function generateDirectorySidebar(dirPath: string, basePath: string): any[] {
  const items: any[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    // 处理子目录
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of directories) {
      const subDirPath = resolve(dirPath, dir.name);
      const subItems = generateDirectorySidebar(subDirPath, basePath);

      if (subItems.length > 0) {
        // 检查是否有README文件，如果有则添加链接
        const readmePath = resolve(subDirPath, "README.md");
        const hasReadme = statSync(readmePath, {
          throwIfNoEntry: false,
        })?.isFile();

        const relativePath = subDirPath
          .replace(resolve(apisPath), "")
          .replace(/\\/g, "/");
        const linkPath = `/apis${relativePath}/`;

        items.push({
          text: dir.name,
          collapsed: true,
          link: hasReadme ? linkPath : undefined,
          items: subItems,
        });
      }
    }

    // 处理其他markdown文件
    const mdFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          entry.name.toLowerCase() !== "readme.md",
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const file of mdFiles) {
      const relativePath = dirPath
        .replace(resolve(apisPath), "")
        .replace(/\\/g, "/");
      const fileName = file.name.replace(".md", "");
      const linkPath = `/apis${relativePath}/${fileName}/`;

      items.push({
        text: fileName,
        link: linkPath,
      });
    }
  } catch (error) {
    console.warn(`Error reading directory ${dirPath}:`, error);
  }

  return items;
}
