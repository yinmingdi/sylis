import { ChatCompletionTool } from 'openai/resources/chat/completions';

import { AIToolsCollection, createToolChoice } from '../../ai/tools/base.tools';

/**
 * 返回选择题的 tool 定义
 */
const RETURN_QUIZ_QUESTIONS: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'return_quiz_questions',
    description: '返回生成的英语选择题',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['choice'],
                description: '题目类型，固定为 choice',
              },
              question: {
                type: 'string',
                description: '题目问题描述',
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    word: {
                      type: 'string',
                      description: '选项的单词',
                    },
                    tranCn: {
                      type: 'string',
                      description: '选项的中文翻译',
                    },
                  },
                  required: ['word', 'tranCn'],
                },
                description: '四个选项',
                minItems: 4,
                maxItems: 4,
              },
              answer: {
                type: 'string',
                description: '正确答案（选项中的 word）',
              },
              explanation: {
                type: 'string',
                description: '答案解释',
              },
            },
            required: ['question', 'options', 'answer'],
          },
          description: '选择题列表',
        },
      },
      required: ['questions'],
    },
  },
};

/**
 * 选择题 Tools 集合
 */
export const QuizChoiceTools: AIToolsCollection = {
  tools: [RETURN_QUIZ_QUESTIONS],
  getToolChoice: (functionName: string) => createToolChoice(functionName),
};
