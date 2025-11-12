import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],

  css: {
    modules: {
      // 这里可以自定义 less module 的类名生成规则
      // scopeBehaviour: 'local',
    },
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        // 全局注入 utils.less，让所有 mixin 在所有文件中可用
        // 使用相对路径，相对于每个 Less 文件的位置
        additionalData: `@import "src/styles/utils.less";`,
      },
    },
  },

  server: {
    host: true, // 开启host服务，允许外部访问
    port: 5173, // 指定端口
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
