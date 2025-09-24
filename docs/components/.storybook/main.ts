import type { StorybookConfig } from "@storybook/react-vite";
import type { StoriesEntry } from "@storybook/types";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const config: StorybookConfig = {
  stories: async (): Promise<StoriesEntry[]> => {
    const rootPaths = ["../../../packages", "../../../apps"];

    const stories: StoriesEntry[] = [];
    rootPaths.forEach((rootPath) => {
      const rootDir = resolve(__dirname, rootPath);
      if (existsSync(rootDir)) {
        readdirSync(rootDir).forEach((pkg) => {
          // 忽略 .DS_Store 和其他隐藏文件
          if (pkg.startsWith(".")) {
            return;
          }

          const pkgDir = resolve(rootDir, pkg);
          if (existsSync(pkgDir) && statSync(pkgDir).isDirectory()) {
            stories.push({
              directory: `${rootPath}/${pkg}/src`,
              files: "**/*.stories.@(js|jsx|mjs|ts|tsx)",
              titlePrefix: pkg,
            });
          }
        });
      }
    });

    return stories;
  },
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  managerHead: (head) => {
    // 只在生产环境中设置 base href
    if (process.env.NODE_ENV === "production") {
      return `
        ${head}
        <base href="/sylis/components/">
      `;
    }
    return head;
  },
  // 为 GitHub Pages 部署设置路径
  viteFinal: async (config) => {
    if (process.env.NODE_ENV === "production") {
      config.base = "/sylis/components/";
    }

    // 配置 CSS 预处理器
    config.css = {
      ...config.css,
      preprocessorOptions: {
        less: {
          math: "parens-division",
          relativeUrls: true,
          javascriptEnabled: true,
        },
      },
    };

    // 配置路径别名
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        "@": resolve(__dirname, "../../../"),
        "@sylis/shared": resolve(__dirname, "../../../packages/shared/src"),
        "@sylis/utils": resolve(__dirname, "../../../packages/utils/src"),
      },
    };

    return config;
  },
};

export default config;
