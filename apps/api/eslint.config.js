import commonConfigs from '@sylis/shared/configs/eslint.config.js';
import globals from 'globals';

export default [
  ...commonConfigs,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
