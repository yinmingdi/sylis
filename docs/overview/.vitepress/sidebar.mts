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
        { text: "开发规范", link: "/guide/standards" },
        { text: "贡献指南", link: "/guide/contribution" },
        { text: "故障排除", link: "/guide/troubleshooting" },
        { text: "GitFlow 工作流", link: "/guide/gitflow" },
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
