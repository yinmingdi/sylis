// @ts-check
import eslint from "@eslint/js";
import nxPlugin from "@nx/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export const globalIgnores = {
  ignores: [
    "node_modules/",
    "**/node_modules/",
    "dist/",
    "**/dist/",
    "dist-ssr/",
    "build/",
    "**/build/",
    ".next/",
    "out/",
    ".nx/",
    ".turbo/",
    ".cache/",
    "**/.cache/",
    "**/*.d.ts",
    "!**/*.custom.d.ts",
    "**/*.db",
    "**/*.sqlite",
    "**/*.sqlite3",
    "**/generated/",
    "apps/api/prisma/migrations/",
    "*.log",
    "**/*.log",
    "logs/",
    ".env*",
    "!.env.example",
    ".vscode/",
    ".idea/",
    "*.swp",
    "*.swo",
    "*~",
    ".DS_Store",
    ".DS_Store?",
    "._*",
    ".Spotlight-V100",
    ".Trashes",
    "ehthumbs.db",
    "Thumbs.db",
    "coverage/",
    "**/coverage/",
    ".nyc_output/",
    "**/.vitepress/dist/",
    "**/.vitepress/cache/",
    "docs/components/dist/",
    "commitlint.config.cjs",
    ".lintstagedrc.cjs",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "Dockerfile*",
    "docker-compose*.yml",
    "scripts/",
    "**/scripts/",
    "**/public/",
    "**/assets/",
    "**/seed-data/",
    "**/*.json",
    "!package.json",
    "!**/package.json",
    "!tsconfig*.json",
    "!**/tsconfig*.json",
    "**/__test__/",
    "**/test/",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.e2e-spec.ts",
    "**/*.example.ts",
  ],
};

const dependencyConstraints = [
  {
    sourceTag: "type:app",
    onlyDependOnLibsWithTags: ["type:lib"],
  },
  {
    sourceTag: "type:service",
    onlyDependOnLibsWithTags: ["type:lib"],
  },
  {
    sourceTag: "type:lib",
    onlyDependOnLibsWithTags: ["type:lib"],
  },
  {
    sourceTag: "type:docs",
    onlyDependOnLibsWithTags: ["type:docs", "type:lib"],
  },
  {
    sourceTag: "runtime:browser",
    onlyDependOnLibsWithTags: ["runtime:browser", "runtime:neutral"],
  },
  {
    sourceTag: "runtime:server",
    onlyDependOnLibsWithTags: [
      "runtime:server",
      "runtime:node",
      "runtime:neutral",
    ],
  },
  {
    sourceTag: "runtime:node",
    onlyDependOnLibsWithTags: ["runtime:node", "runtime:neutral"],
  },
  {
    sourceTag: "runtime:neutral",
    onlyDependOnLibsWithTags: ["runtime:neutral"],
  },
  {
    sourceTag: "runtime:docs",
    onlyDependOnLibsWithTags: [
      "runtime:docs",
      "runtime:browser",
      "runtime:neutral",
    ],
  },
];

export const baseConfig = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      "@nx": nxPlugin,
      import: importPlugin,
    },
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          allow: [],
          enforceBuildableLibDependency: false,
          banTransitiveDependencies: true,
          depConstraints: dependencyConstraints,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "prettier/prettier": "off",
      "import/order": [
        "warn",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
    },
  },
];

export const commonConfigs = [globalIgnores, ...baseConfig];

export default commonConfigs;
