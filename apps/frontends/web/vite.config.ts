import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import svgr from 'vite-plugin-svgr';

export function createAgentApiProxyOptions(
  environment: NodeJS.ProcessEnv = process.env,
): ProxyOptions {
  const origin = environment.SYLIS_AGENT_API_PROXY_ORIGIN?.trim();
  return {
    target: environment.SYLIS_AGENT_API_PROXY_TARGET ?? 'http://localhost:3200',
    changeOrigin: true,
    secure: false,
    ...(origin ? { headers: { origin } } : {}),
  };
}

export function createUserApiProxyOptions(
  environment: NodeJS.ProcessEnv = process.env,
): ProxyOptions {
  const origin = environment.SYLIS_API_PROXY_ORIGIN?.trim();
  return {
    target: environment.SYLIS_API_PROXY_TARGET ?? 'http://localhost:3000',
    changeOrigin: true,
    secure: false,
    ...(origin ? { headers: { origin } } : {}),
  };
}

function rejectNodeBuiltins(): Plugin {
  return {
    name: 'sylis-browser-boundary',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith('node:')) return null;
      this.error(
        `Browser bundles cannot import Node.js builtin ${source}${importer ? ` imported by ${importer}` : ''}`,
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [rejectNodeBuiltins(), react(), svgr()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sylis/api-client/user': fileURLToPath(
        new URL(
          '../../../packages/api-client/src/user/index.ts',
          import.meta.url,
        ),
      ),
    },
  },
  css: {
    modules: {},
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        additionalData: `@import "src/styles/utils.less";`,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@sylis/api-client/user'],
    include: [
      '@sylis/api-client/agent',
      '@sylis/components',
      '@sylis/job-contracts',
      '@sylis/utils',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/[^/]+\/dist/],
    },
  },

  server: {
    host: true,
    port: 5178,
    proxy: {
      '/api/agent': {
        ...createAgentApiProxyOptions(),
      },
      '/api': createUserApiProxyOptions(),
    },
  },
});
