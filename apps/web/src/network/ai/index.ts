import OpenAI from 'openai';

// AI服务配置
const AI_CONFIG = {
  apiKey: import.meta.env.VITE_APP_AI_KEY || '',
  baseURL: import.meta.env.VITE_APP_AI_URL || '',
  model: import.meta.env.VITE_APP_AI_MODEL || 'gpt-3.5-turbo',
};

console.log('AI配置:', {
  hasApiKey: !!AI_CONFIG.apiKey,
  baseURL: AI_CONFIG.baseURL,
  model: AI_CONFIG.model,
});

export const client = new OpenAI({
  apiKey: AI_CONFIG.apiKey,
  dangerouslyAllowBrowser: true,
  baseURL: AI_CONFIG.baseURL,
});

// 消息类型定义
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 聊天完成参数
export interface ChatCompletionParams {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// 流式响应处理器类型
export interface StreamHandler {
  onStart?: () => void;
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

// AI服务类
export class AIService {
  private client: OpenAI;
  private abortController: AbortController | null = null;

  constructor() {
    this.client = client;
  }

  // 流式聊天（使用回调模式）
  async streamChatWithHandler(
    params: ChatCompletionParams,
    handler: StreamHandler,
  ): Promise<string> {
    this.abortController = new AbortController();
    const currentController = this.abortController; // 保存当前controller的引用
    let fullContent = '';

    try {
      handler.onStart?.();

      const stream = await this.client.chat.completions.create(
        {
          model: params.model || AI_CONFIG.model,
          messages: params.messages,
          stream: true,
          temperature: params.temperature || 0.7,
          max_tokens: params.max_tokens || 1000,
        },
        {
          signal: currentController.signal,
        },
      );

      for await (const chunk of stream) {
        if (currentController.signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullContent += content;
          handler.onChunk?.(content);
        }
      }

      handler.onComplete?.(fullContent);
      return fullContent;
    } catch (error) {
      const err = error as Error;
      handler.onError?.(err);
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  // 流式聊天（生成器模式）
  async *streamChat(params: ChatCompletionParams) {
    this.abortController = new AbortController();
    const currentController = this.abortController; // 保存当前controller的引用

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: params.model || AI_CONFIG.model,
          messages: params.messages,
          stream: true,
          temperature: params.temperature || 0.7,
          max_tokens: params.max_tokens || 1000,
        },
        {
          signal: currentController.signal,
        },
      );

      for await (const chunk of stream) {
        if (currentController.signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('流式聊天错误:', error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  // 普通聊天
  async chat(params: ChatCompletionParams): Promise<string> {
    this.abortController = new AbortController();
    const currentController = this.abortController; // 保存当前controller的引用

    try {
      const response = await this.client.chat.completions.create(
        {
          model: params.model || AI_CONFIG.model,
          messages: params.messages,
          stream: false,
          temperature: params.temperature || 0.7,
          max_tokens: params.max_tokens || 1000,
        },
        {
          signal: currentController.signal,
        },
      );

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('聊天错误:', error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  // 取消当前请求
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  // 检查是否正在请求中
  isRequesting(): boolean {
    return this.abortController !== null;
  }

  // 检查服务可用性
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error('AI服务不可用:', error);
      return false;
    }
  }
}

// 故事生成相关类型定义
export interface Word {
  word: string;
  meaning: string;
}

export interface StoryGenerationParams {
  words: Word[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  theme?: string;
  maxLength?: number;
}

export interface StoryGenerationProgress {
  stage: 'analyzing' | 'plotting' | 'writing' | 'polishing' | 'completed';
  progress: number;
  message: string;
}

// 短文填词相关类型定义
export interface ClozeQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  position: number; // 在文章中的位置
}

export interface ClozeArticle {
  title: string;
  content: string;
  questions: ClozeQuestion[];
  difficulty: string;
  theme: string;
  totalWords: number;
  estimatedTime: number;
}

export interface ClozeGenerationParams {
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  theme: string;
  questionCount?: number;
  maxLength?: number;
}

// 扩展AI服务类，添加故事生成功能
export class ExtendedAIService extends AIService {
  // 生成故事（流式）
  async generateStoryStream(
    params: StoryGenerationParams,
    onProgress?: (progress: StoryGenerationProgress) => void,
    onChunk?: (content: string) => void,
  ): Promise<string> {
    const { words, level = 'intermediate', theme, maxLength = 800 } = params;

    // 构建系统提示词
    const systemPrompt = this.buildStoryPrompt(words, level, theme, maxLength);

    // 构建用户消息
    const wordList = words.map((w) => `${w.word} (${w.meaning})`).join('\n');
    const userMessage = `请为以下单词创作一个故事：\n\n${wordList}`;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let fullContent = '';
    let currentStage: StoryGenerationProgress['stage'] = 'analyzing';
    let progressValue = 0;

    // 模拟进度更新
    const progressTimer = setInterval(() => {
      progressValue += Math.random() * 10;

      if (progressValue < 25) {
        currentStage = 'analyzing';
      } else if (progressValue < 50) {
        currentStage = 'plotting';
      } else if (progressValue < 75) {
        currentStage = 'writing';
      } else if (progressValue < 95) {
        currentStage = 'polishing';
      }

      onProgress?.({
        stage: currentStage,
        progress: Math.min(progressValue, 95),
        message: this.getStageMessage(currentStage),
      });
    }, 200);

    try {
      const result = await this.streamChatWithHandler(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.8,
          max_tokens: 1500,
        },
        {
          onStart: () => {
            onProgress?.({
              stage: 'analyzing',
              progress: 0,
              message: '开始分析单词语义...',
            });
          },
          onChunk: (content) => {
            fullContent += content;
            onChunk?.(content);
          },
          onComplete: () => {
            clearInterval(progressTimer);
            onProgress?.({
              stage: 'completed',
              progress: 100,
              message: '故事创作完成！',
            });
          },
          onError: (error) => {
            clearInterval(progressTimer);
            throw error;
          },
        },
      );

      return result;
    } catch (error) {
      clearInterval(progressTimer);
      throw error;
    }
  }

  // 构建故事生成的系统提示词
  private buildStoryPrompt(
    _words: Word[],
    level: string,
    theme?: string,
    maxLength = 800,
  ): string {
    const levelInstructions = {
      beginner: '使用简单的句子结构和常见词汇，语法简单易懂',
      intermediate: '使用中等复杂度的句子结构，词汇丰富但不过于困难',
      advanced: '可以使用复杂的句子结构和高级词汇，语法多样化',
    };

    const themeInstruction = theme ? `故事主题围绕"${theme}"展开。` : '';

    return `你是一位专业的英语学习故事创作者。请根据给定的英语单词创作一个引人入胜的故事，帮助学习者在语境中记忆这些单词。

要求：
1. 故事长度约${maxLength}字
2. 必须自然地使用所有提供的单词，每个单词至少使用一次
3. 语言难度：${levelInstructions[level as keyof typeof levelInstructions]}
4. ${themeInstruction}
5. 故事要有完整的情节：开头、发展、高潮、结尾
6. 在使用目标单词时，要确保语境清晰，有助于理解单词含义
7. 故事要生动有趣，激发学习者的兴趣

格式要求：
- 使用markdown格式
- 给故事一个吸引人的标题
- 适当分段，提高可读性
- 可以加入一些对话让故事更生动

请创作一个优质的英语学习故事。`;
  }

  // 获取当前阶段的提示信息
  private getStageMessage(stage: StoryGenerationProgress['stage']): string {
    const messages = {
      analyzing: '分析单词语义和关联性...',
      plotting: '构思故事情节和结构...',
      writing: '编写故事内容...',
      polishing: '完善故事细节和语言...',
      completed: '故事创作完成！',
    };

    return messages[stage];
  }

  // 快速生成故事（非流式）
  async generateStory(params: StoryGenerationParams): Promise<string> {
    const { words, level = 'intermediate', theme, maxLength = 800 } = params;

    const systemPrompt = this.buildStoryPrompt(words, level, theme, maxLength);
    const wordList = words.map((w) => `${w.word} (${w.meaning})`).join('\n');
    const userMessage = `请为以下单词创作一个故事：\n\n${wordList}`;

    return await this.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 1500,
    });
  }

  // 优化故事（重新生成）
  async improveStory(
    originalStory: string,
    words: Word[],
    feedback?: string,
  ): Promise<string> {
    const systemPrompt = `你是一位专业的英语学习故事编辑。请根据反馈改进这个英语学习故事，确保：
1. 保持故事的教育价值
2. 所有目标单词都被自然使用
3. 故事更加引人入胜
4. 语言表达更加准确流畅`;

    const userMessage = `原故事：\n${originalStory}\n\n目标单词：\n${words.map((w) => `${w.word} (${w.meaning})`).join('\n')}\n\n${feedback ? `改进要求：${feedback}` : '请优化这个故事，使其更加生动有趣。'}`;

    return await this.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });
  }

  // 生成短文填词（流式）
  async generateClozeTestStream(
    params: ClozeGenerationParams,
    onProgress?: (progress: StoryGenerationProgress) => void,
    onResult?: (clozeData: ClozeArticle) => void,
  ): Promise<ClozeArticle> {
    const {
      difficulty = 'intermediate',
      theme,
      questionCount = 10,
      maxLength = 400,
    } = params;

    // 构建系统提示词
    const systemPrompt = this.buildClozePrompt(
      difficulty,
      theme,
      questionCount,
      maxLength,
    );

    // 构建用户消息
    const userMessage = `请生成一个${difficulty}难度、主题为"${theme}"的英语短文填词练习，包含${questionCount}个填空题。`;

    let fullContent = '';
    let currentStage: StoryGenerationProgress['stage'] = 'analyzing';
    let progressValue = 0;

    // 模拟进度更新
    const progressTimer = setInterval(() => {
      progressValue += Math.random() * 15;

      if (progressValue < 30) {
        currentStage = 'analyzing';
      } else if (progressValue < 60) {
        currentStage = 'writing';
      } else if (progressValue < 85) {
        currentStage = 'polishing';
      }

      onProgress?.({
        stage: currentStage,
        progress: Math.min(progressValue, 95),
        message: this.getClozeStageMessage(currentStage),
      });
    }, 300);

    try {
      await this.streamChatWithHandler(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          onStart: () => {
            onProgress?.({
              stage: 'analyzing',
              progress: 0,
              message: '开始分析主题内容...',
            });
          },
          onChunk: (content) => {
            fullContent += content;
          },
          onComplete: () => {
            clearInterval(progressTimer);
            onProgress?.({
              stage: 'completed',
              progress: 100,
              message: '短文填词生成完成！',
            });
          },
          onError: (error) => {
            clearInterval(progressTimer);
            throw error;
          },
        },
      );

      // 解析AI返回的JSON数据
      const clozeData = this.parseClozeResponse(fullContent, difficulty, theme);
      onResult?.(clozeData);

      return clozeData;
    } catch (error) {
      clearInterval(progressTimer);
      throw error;
    }
  }

  // 构建短文填词的系统提示词
  private buildClozePrompt(
    difficulty: string,
    theme: string,
    questionCount: number,
    maxLength: number,
  ): string {
    const levelInstructions = {
      beginner: '使用简单的句子结构和常见词汇，语法基础',
      intermediate: '使用中等复杂度的句子结构，词汇量适中',
      advanced: '可以使用复杂的句子结构和高级词汇，语法多样化',
    };

    return `你是一位专业的英语短文填词练习出题老师。请根据要求生成一个高质量的英语短文填词练习。

要求：
1. 文章主题：${theme}
2. 难度级别：${difficulty} - ${levelInstructions[difficulty as keyof typeof levelInstructions]}
3. 文章长度：约${maxLength}词
4. 填空题数量：${questionCount}个
5. 文章要完整、有逻辑、内容有趣
6. 每个填空都要有4个选项，其中只有1个正确答案
7. 填空应该考查不同类型的语言知识：词汇、语法、语义理解等

输出格式要求（严格按照以下JSON格式输出）：
\`\`\`json
{
  "title": "文章标题",
  "content": "带有填空的文章内容，用 [1] [2] [3] 等标记填空位置",
  "questions": [
    {
      "id": 1,
      "question": "第1个空应该填入什么？",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctIndex": 0,
      "position": 1
    }
  ],
  "totalWords": 实际字数,
  "estimatedTime": 预估完成时间(分钟)
}
\`\`\`

注意：
- 确保文章语法正确、表达自然
- 选项设计要有一定干扰性但区分度明确
- 填空位置要分布均匀，不要过于集中
- 内容要积极向上，适合学习者阅读`;
  }

  // 获取短文填词生成阶段的提示信息
  private getClozeStageMessage(
    stage: StoryGenerationProgress['stage'],
  ): string {
    const messages = {
      analyzing: '分析主题和难度要求...',
      plotting: '构思文章结构和内容...',
      writing: '编写文章和设计填空题...',
      polishing: '优化题目质量和选项设计...',
      completed: '短文填词生成完成！',
    };

    return messages[stage];
  }

  // 解析AI返回的短文填词数据
  private parseClozeResponse(
    response: string,
    difficulty: string,
    theme: string,
  ): ClozeArticle {
    try {
      // 提取JSON部分
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        throw new Error('无法解析AI返回的数据格式');
      }

      const jsonData = JSON.parse(jsonMatch[1]);

      // 验证必要字段
      if (!jsonData.title || !jsonData.content || !jsonData.questions) {
        throw new Error('AI返回的数据不完整');
      }

      // 为每个问题添加唯一ID（如果没有的话）
      const questions = jsonData.questions.map((q: any, index: number) => ({
        id: q.id || index + 1,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        position: q.position || index + 1,
      }));

      return {
        title: jsonData.title,
        content: jsonData.content,
        questions,
        difficulty,
        theme,
        totalWords: jsonData.totalWords || 300,
        estimatedTime:
          jsonData.estimatedTime || Math.ceil(questions.length * 0.8),
      };
    } catch (error) {
      console.error('解析短文填词数据失败:', error);

      // 返回一个示例数据作为备选
      return this.getFallbackClozeData(difficulty, theme);
    }
  }

  // 获取备选的短文填词数据
  private getFallbackClozeData(
    difficulty: string,
    theme: string,
  ): ClozeArticle {
    return {
      title: `${theme}主题练习`,
      content: `This is a sample article about ${theme}. Technology has [1] our daily lives in many ways. People now [2] on smartphones and computers for communication, work, and entertainment. The [3] of artificial intelligence is particularly exciting, as it promises to [4] various industries. However, we must also [5] the potential challenges that come with rapid technological advancement.`,
      questions: [
        {
          id: 1,
          question: '第1个空应该填入什么？',
          options: ['changed', 'destroyed', 'ignored', 'forgotten'],
          correctIndex: 0,
          position: 1,
        },
        {
          id: 2,
          question: '第2个空应该填入什么？',
          options: ['avoid', 'refuse', 'rely', 'escape'],
          correctIndex: 2,
          position: 2,
        },
        {
          id: 3,
          question: '第3个空应该填入什么？',
          options: ['development', 'destruction', 'confusion', 'elimination'],
          correctIndex: 0,
          position: 3,
        },
        {
          id: 4,
          question: '第4个空应该填入什么？',
          options: ['harm', 'transform', 'confuse', 'limit'],
          correctIndex: 1,
          position: 4,
        },
        {
          id: 5,
          question: '第5个空应该填入什么？',
          options: ['ignore', 'consider', 'avoid', 'reject'],
          correctIndex: 1,
          position: 5,
        },
      ],
      difficulty,
      theme,
      totalWords: 85,
      estimatedTime: 8,
    };
  }

  // 快速生成短文填词（非流式）
  async generateClozeTest(
    params: ClozeGenerationParams,
  ): Promise<ClozeArticle> {
    const {
      difficulty = 'intermediate',
      theme,
      questionCount = 10,
      maxLength = 400,
    } = params;

    const systemPrompt = this.buildClozePrompt(
      difficulty,
      theme,
      questionCount,
      maxLength,
    );
    const userMessage = `请生成一个${difficulty}难度、主题为"${theme}"的英语短文填词练习，包含${questionCount}个填空题。`;

    const response = await this.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return this.parseClozeResponse(response, difficulty, theme);
  }
}

// 导出扩展的AI服务实例
export const aiService = new ExtendedAIService();

// 导出配置
export { AI_CONFIG };
