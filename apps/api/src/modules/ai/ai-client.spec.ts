import { createAIClient } from './ai-client';

describe('createAIClient', () => {
  it('forces the configured DeepSeek model and disables thinking', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-completion',
          object: 'chat.completion',
          created: 0,
          model: 'deepseek-v4-flash',
          choices: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    try {
      const client = createAIClient({
        apiKey: 'test-key',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
      });
      await client.chat.completions.create({
        model: 'incompatible-model',
        messages: [{ role: 'user', content: 'hello' }],
      });

      const init = fetchMock.mock.calls[0]?.[1];
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe('deepseek-v4-flash');
      expect(body.thinking).toEqual({ type: 'disabled' });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
