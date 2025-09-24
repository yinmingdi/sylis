/**
 * 通用提示词构建工具
 */
export class PromptBuilder {
  /**
   * 替换模板中的占位符
   */
  static replacePlaceholders(
    template: string,
    params: Record<string, any>,
  ): string {
    let result = template;

    Object.entries(params).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return result;
  }

  /**
   * 构建条件内容
   */
  static buildConditionalContent(condition: boolean, content: string): string {
    return condition ? content : '';
  }

  /**
   * 构建列表内容
   */
  static buildList(
    items: Array<{ key: string; value: string }>,
    separator: string = '\n',
  ): string {
    return items.map((item) => `${item.key}: ${item.value}`).join(separator);
  }

  /**
   * 格式化单词列表
   */
  static formatWordList(
    words: Array<{ word: string; tranCn: string }>,
    format: 'simple' | 'detailed' = 'simple',
  ): string {
    if (format === 'simple') {
      return words.map((w) => w.word).join(', ');
    }
    return words.map((w) => `${w.word} (${w.tranCn})`).join('\n');
  }
}
