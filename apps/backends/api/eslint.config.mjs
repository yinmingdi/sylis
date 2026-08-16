import globals from "globals";

import commonConfigs from "../../../eslint.config.js";

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
