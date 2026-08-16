// @vitest-environment node

import { describe, expect, it } from 'vitest';

import webConfig, {
  createAgentApiProxyOptions,
  createUserApiProxyOptions,
} from './vite.config';

describe('createAgentApiProxyOptions', () => {
  it('uses environment-provided Docker service target and public origin', () => {
    expect(
      createAgentApiProxyOptions({
        SYLIS_AGENT_API_PROXY_TARGET: 'http://127.0.0.1:17004',
        SYLIS_AGENT_API_PROXY_ORIGIN: 'http://127.0.0.1:17000',
      }),
    ).toMatchObject({
      target: 'http://127.0.0.1:17004',
      changeOrigin: true,
      secure: false,
      headers: { origin: 'http://127.0.0.1:17000' },
    });
  });
});

describe('createUserApiProxyOptions', () => {
  it('rewrites the proxied Origin to the API public origin', () => {
    expect(
      createUserApiProxyOptions({
        SYLIS_API_PROXY_TARGET: 'http://127.0.0.1:17002',
        SYLIS_API_PROXY_ORIGIN: 'http://127.0.0.1:17000',
      }),
    ).toMatchObject({
      target: 'http://127.0.0.1:17002',
      changeOrigin: true,
      secure: false,
      headers: { origin: 'http://127.0.0.1:17000' },
    });
  });

  it('does not rewrite Origin unless an API public origin is configured', () => {
    expect(createUserApiProxyOptions({})).not.toHaveProperty('headers');
  });

  it('loads the user API client from current workspace source', () => {
    const aliases = webConfig.resolve?.alias;
    expect(aliases).toMatchObject({
      '@sylis/api-client/user': expect.stringMatching(
        /packages\/api-client\/src\/user\/index\.ts$/,
      ),
    });
    expect(webConfig.optimizeDeps?.exclude).toContain('@sylis/api-client/user');
    expect(webConfig.optimizeDeps?.include).not.toContain(
      '@sylis/api-client/user',
    );
  });
});
