// @ts-check
import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

// 全局忽略规则配置
export const globalIgnores = {
  ignores: [
    // Dependencies
    'node_modules/',
    '**/node_modules/',

    // Build outputs
    'dist/',
    '**/dist/',
    'dist-ssr/',
    'build/',
    '**/build/',
    '.next/',
    'out/',

    // Cache directories
    '.turbo/',
    '.cache/',
    '**/.cache/',

    // Generated files
    '**/*.d.ts',
    '!**/*.custom.d.ts',

    // Database
    '**/*.db',
    '**/*.sqlite',
    '**/*.sqlite3',

    // Prisma generated
    '**/generated/',
    'apps/api/prisma/migrations/',

    // Logs
    '*.log',
    '**/*.log',
    'logs/',

    // Environment files
    '.env*',
    '!.env.example',

    // IDE/Editor files
    '.vscode/',
    '.idea/',
    '*.swp',
    '*.swo',
    '*~',

    // OS generated files
    '.DS_Store',
    '.DS_Store?',
    '._*',
    '.Spotlight-V100',
    '.Trashes',
    'ehthumbs.db',
    'Thumbs.db',

    // Testing
    'coverage/',
    '**/coverage/',
    '.nyc_output/',

    // Documentation build
    'docs/overview/.vitepress/dist/',
    'docs/overview/.vitepress/cache/',
    'docs/components/dist/',

    // VitePress generated files
    '**/.vitepress/dist/',
    '**/.vitepress/cache/',

    // Config files (optional - remove if you want to lint config files)
    'commitlint.config.cjs',
    '.lintstagedrc.cjs',

    // Package manager files
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',

    // All files in dist directories (build outputs)
    '**/dist/**',

    // Python (for speech service)
    'services/speech-service/**/*.pyc',
    'services/speech-service/**/__pycache__/',
    'services/speech-service/**/*.pyo',
    'services/speech-service/**/*.pyd',
    'services/speech-service/**/.Python',
    'services/speech-service/**/env/',
    'services/speech-service/**/venv/',

    // Docker
    'Dockerfile*',
    'docker-compose*.yml',

    // Scripts
    'scripts/',
    '**/scripts/',

    // Public assets that don't need linting
    '**/public/',
    '**/assets/',

    // Seed data
    '**/seed-data/',
    '**/*.json',
    '!package.json',
    '!**/package.json',
    '!tsconfig*.json',
    '!**/tsconfig*.json',

    // Test files (optional - remove if you want to lint test files)
    '**/__test__/',
    '**/test/',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.e2e-spec.ts',
  ],
};

// 基础配置，可以被其他项目扩展
export const baseConfig = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // ✅ 关闭 Prettier 格式化规则
      'prettier/prettier': 'off',

      // ✅ import 排序
      'import/order': [
        'warn',
        {
          groups: [
            ['builtin', 'external'],
            'internal',
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
  },
];

// 完整配置（包含忽略规则）
export const commonConfigs = [globalIgnores, ...baseConfig];

// 默认导出完整配置
export default commonConfigs;
