import OpenAI from 'openai';

export interface AIClientOptions {
  apiKey: string;
  baseURL: string;
  model: string;
}

export function createAIClient(options: AIClientOptions) {
  const isDeepSeek = new URL(options.baseURL).hostname.endsWith('deepseek.com');

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    fetch: async (url, init) => {
      if (typeof init?.body !== 'string') return fetch(url, init);

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return fetch(url, init);
      }

      body.model = options.model;
      if (isDeepSeek && String(url).includes('/chat/completions')) {
        body.thinking = { type: 'disabled' };
      }

      return fetch(url, { ...init, body: JSON.stringify(body) });
    },
  });
}
