import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
