import { defineConfig } from "vitepress";

import { getGuideSidebar, getApiSidebar } from "./sidebar.mts";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Sylis",
  description: "现代化的英语学习应用文档",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/icons/logo.png",
    nav: [
      { text: "指南", link: "guide/quick-start", activeMatch: "/guide/" },
      { text: "Apis", link: "apis", activeMatch: "/apis/" },
      { text: "组件", link: "http://localhost:6006" },
      { text: "Swagger", link: "http://localhost:3000/swagger" },
    ],
    sidebar: {
      "/guide/": getGuideSidebar(),
      "/apis/": getApiSidebar(),
    },
    search: {
      provider: "local",
    },
    outline: {
      level: "deep",
    },
  },
  srcDir: "../../",
  rewrites: {
    "README.md": "guide/quick-start.md",
    "docs/overview/:path*": ":path*",
    "packages/:pkg/README.md": "guide/:pkg.md",
    "apps/:pkg/README.md": "guide/:pkg.md",
  },
  vite: {
    publicDir: "docs/overview/public",
    server: {
      port: 5174,
    },
    css: {
      preprocessorOptions: {
        css: {
          charset: false,
        },
      },
    },
  },
  head: [["link", { rel: "icon", href: "/icons/logo.png" }]],
});
