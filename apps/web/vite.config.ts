import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  css: {
    modules: {
      // 这里可以自定义 less module 的类名生成规则
      // scopeBehaviour: 'local',
    },
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        // 这里可以添加全局 less 变量等配置
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
