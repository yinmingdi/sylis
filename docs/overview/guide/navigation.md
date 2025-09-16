# 服务导航指南

Sylis 项目在 GitHub Pages 上部署了多个服务，本指南将帮助您了解如何在不同服务间导航。

## 🌐 服务架构

我们的文档和组件库分别部署在不同的路径下：

### 主要服务

| 服务          | 地址           | 描述                     |
| ------------- | -------------- | ------------------------ |
| 📖 **主文档** | `/`            | VitePress 驱动的项目文档 |
| 🧩 **组件库** | `/components/` | Storybook 驱动的组件文档 |

## 🔗 快速导航

### 从文档导航到组件库

在文档的导航栏中，点击 **"组件"** 链接即可跳转到组件库。

### 从组件库返回文档

组件库页面提供了返回主文档的导航方式。

## 🚀 本地开发

在本地开发环境中，服务运行在不同的端口：

```bash
# 启动文档服务 (端口 5174)
cd docs/overview
pnpm run docs:dev

# 启动组件库服务 (端口 6006)
cd docs/components
pnpm run docs:dev
```

## 📝 部署说明

### 自动部署

- 推送到 `main` 分支时，GitHub Actions 会自动构建并部署两个服务
- 部署路径：
  - 文档：`https://<username>.github.io/<repo>/`
  - 组件库：`https://<username>.github.io/<repo>/components/`

### 手动部署

您也可以在 GitHub Actions 页面手动触发部署工作流。

## 🛠️ 配置说明

### VitePress 配置

- 生产环境下自动设置正确的 `base` 路径
- 导航链接根据环境自动切换

### Storybook 配置

- 配置了正确的基础路径用于 GitHub Pages 部署
- 支持从项目的 `packages` 和 `apps` 目录自动发现组件故事

## 📚 相关链接

- [VitePress 文档](https://vitepress.dev/)
- [Storybook 文档](https://storybook.js.org/)
- [GitHub Pages 文档](https://docs.github.com/en/pages)
