import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  managerHead: (head) =>
    process.env.NODE_ENV === "production"
      ? `${head}<base href="/sylis/components/">`
      : head,
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    base:
      process.env.NODE_ENV === "production"
        ? "/sylis/components/"
        : viteConfig.base,
    optimizeDeps: {
      ...viteConfig.optimizeDeps,
      include: [
        ...(viteConfig.optimizeDeps?.include ?? []),
        "@sylis/components",
      ],
    },
    build: {
      ...viteConfig.build,
      commonjsOptions: {
        ...viteConfig.build?.commonjsOptions,
        include: [/node_modules/, /packages\/[^/]+\/dist/],
      },
    },
  }),
};

export default config;
