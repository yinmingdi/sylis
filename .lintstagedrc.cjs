module.exports = {
  "apps/web/**/*.{js,ts,tsx}": ["cd apps/web && eslint --fix"],
  "apps/api/**/*.{js,ts}": ["cd apps/api && eslint --fix"],
  "packages/**/*.{js,ts}": ["eslint --fix"],
};
