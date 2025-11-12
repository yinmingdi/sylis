import { ChatCompletionTool } from 'openai/resources/chat/completions';

import { AIToolsCollection, createToolChoice } from './base.tools';

/**
 * 返回语法分析的 tool 定义
 */
const RETURN_GRAMMAR_ANALYSIS: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'return_grammar_analysis',
    description: '返回英语句子的语法分析结果',
    parameters: {
      type: 'object',
      properties: {
        sentence: {
          type: 'string',
          description: '原始英文句子',
        },
        translation: {
          type: 'string',
          description: '中文翻译',
        },
        aiExplanation: {
          type: 'string',
          description: 'AI解析，包含句子含义解释和语法分析',
        },
        grammarAnalysis: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              component: {
                type: 'string',
                description: '语法成分（主语、谓语、宾语等）',
              },
              text: {
                type: 'string',
                description: '对应的文本',
              },
              explanation: {
                type: 'string',
                description: '语法解释',
              },
            },
            required: ['component', 'text', 'explanation'],
          },
          description: '语法分析列表',
        },
        phraseAccumulation: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: '搭配积累列表',
        },
      },
      required: [
        'sentence',
        'translation',
        'aiExplanation',
        'grammarAnalysis',
        'phraseAccumulation',
      ],
    },
  },
};

/**
 * 语法分析 Tools 集合
 */
export const GrammarTools: AIToolsCollection = {
  tools: [RETURN_GRAMMAR_ANALYSIS],
  getToolChoice: (functionName: string) => createToolChoice(functionName),
};
