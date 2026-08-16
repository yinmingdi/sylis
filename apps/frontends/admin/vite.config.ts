import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

function rejectNodeBuiltins(): Plugin {
  return {
    name: "sylis-browser-boundary",
    enforce: "pre",
    resolveId(source, importer) {
      if (!source.startsWith("node:")) return null;
      this.error(
        `Browser bundles cannot import Node.js builtin ${source}${importer ? ` imported by ${importer}` : ""}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [rejectNodeBuiltins(), react()],
  optimizeDeps: {
    include: ["@sylis/api-client/admin", "@sylis/components", "@sylis/utils"],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/[^/]+\/dist/],
    },
  },
  server: {
    host: true,
    port: 5180,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
