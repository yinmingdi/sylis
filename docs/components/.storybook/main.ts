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
};

export default config;
