import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * AI Tools 集合接口
 */
export interface AIToolsCollection {
  tools: ChatCompletionTool[];
  getToolChoice: (functionName: string) => {
    type: 'function';
    function: { name: string };
  };
}

/**
 * 创建 tool choice 配置
 * @param functionName 函数名
 */
export const createToolChoice = (functionName: string) => ({
  type: 'function' as const,
  function: {
    name: functionName,
  },
});
