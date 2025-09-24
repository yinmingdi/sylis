import { defineConfig } from "vitepress";

import { getGuideSidebar, getApiSidebar } from "./sidebar.mts";

// 根据环境确定基础路径和链接
const isProd = process.env.NODE_ENV === "production";
const base = isProd ? "/sylis/" : "/";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Sylis",
  description: "现代化的英语学习应用文档",
  base,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/icons/logo.png",
    nav: [
      { text: "指南", link: "guide/what-is-sylis", activeMatch: "/guide/" },
      { text: "Apis", link: "/apis/", activeMatch: "/apis/" },
      {
        text: "组件",
        link: isProd ? `/components/` : "http://localhost:6006",
        target: "_blank",
      },
      {
        text: "Swagger",
        link: isProd ? `/swagger/` : "http://localhost:3000/swagger",
        target: "_blank",
      },
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
  srcDir: ".",
  rewrites: {
    "README.md": "guide/quick-start.md",
    "docs/overview/:path*": ":path*",
    // "packages/:pkg/README.md": "guide/:pkg.md",
    // "apps/:pkg/README.md": "guide/:pkg.md",
  },
  vite: {
    server: {
      port: 5174,
    },
  },
  head: [["link", { rel: "icon", href: "/icons/logo.png" }]],
  ignoreDeadLinks: [
    // Ignore localhost links during build (these are development URLs)
    /^http:\/\/localhost/,
    // Ignore relative file links that may not exist in build
    /^\.\/[^/]+\.md$/,
    /^\.\/docs\/overview\/[^/]+$/,
  ],
});
