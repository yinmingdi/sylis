const path = require("node:path");

const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const under = (file, directory) =>
  file.startsWith(`${path.resolve(directory)}${path.sep}`);
const rootCommand = (files) => {
  if (files.length === 0) return null;
  return `eslint --fix --no-warn-ignored ${files.map(quote).join(" ")}`;
};
const workspaceCommand = (files, directory) => {
  if (files.length === 0) return null;
  const workspace = path.resolve(directory);
  const relativeFiles = files.map((file) => path.relative(workspace, file));
  return `cd ${quote(directory)} && eslint --fix --no-warn-ignored ${relativeFiles.map(quote).join(" ")}`;
};

module.exports = {
  "{apps/frontends,apps/backends,packages}/**/*.{js,mjs,cjs,ts,tsx}": (
    files,
  ) => {
    const web = files.filter((file) => under(file, "apps/frontends/web"));
    const api = files.filter((file) => under(file, "apps/backends/api"));
    const remaining = files.filter(
      (file) =>
        !under(file, "apps/frontends/web") && !under(file, "apps/backends/api"),
    );

    return [
      workspaceCommand(web, "apps/frontends/web"),
      workspaceCommand(api, "apps/backends/api"),
      rootCommand(remaining),
    ].filter(Boolean);
  },
};
