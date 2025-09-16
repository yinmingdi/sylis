import type { BubbleProps } from '@ant-design/x';
import markdownit from 'markdown-it';

function wordWrapperPlugin(md: markdownit) {
  // 正则匹配英文单词（a-zA-Z，支持如 "don't" 的缩写）
  const wordRegex = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g;

  // 在 core ruler 中添加规则（解析后运行）
  md.core.ruler.push('wrap_english_words', (state) => {
    // 遍历所有 token
    state.tokens.forEach((blockToken) => {
      // 只处理 inline 类型（包含文本的块，如段落）
      if (blockToken.type === 'inline' && blockToken.children) {
        const newChildren: any[] = [];

        // 遍历子 token
        blockToken.children.forEach((token) => {
          // 只针对纯文本 token
          if (token.type === 'text') {
            const content = token.content;
            let lastIndex = 0;

            // 找到所有英文单词的位置
            let match;
            while ((match = wordRegex.exec(content)) !== null) {
              // 添加单词前的文本
              if (match.index > lastIndex) {
                const textToken = new state.Token('text', '', 0);
                textToken.content = content.slice(lastIndex, match.index);
                newChildren.push(textToken);
              }

              // 创建 HTML 开始标签
              const htmlOpenToken = new state.Token('html_inline', '', 0);
              htmlOpenToken.content = `<span data-word="${match[0]}">`;
              newChildren.push(htmlOpenToken);

              // 添加单词文本
              const wordToken = new state.Token('text', '', 0);
              wordToken.content = match[0];
              newChildren.push(wordToken);

              // 创建 HTML 结束标签
              const htmlCloseToken = new state.Token('html_inline', '', 0);
              htmlCloseToken.content = '</span>';
              newChildren.push(htmlCloseToken);

              lastIndex = match.index + match[0].length;
            }

            // 添加剩余的文本
            if (lastIndex < content.length) {
              const textToken = new state.Token('text', '', 0);
              textToken.content = content.slice(lastIndex);
              newChildren.push(textToken);
            }

            // 重置正则表达式的lastIndex
            wordRegex.lastIndex = 0;
          } else {
            // 非文本 token 直接添加
            newChildren.push(token);
          }
        });

        // 替换子 token
        blockToken.children = newChildren;
      }
    });
  });
}
export const useMarkdown = () => {
  const md = markdownit({ html: true, breaks: true });
  md.use(wordWrapperPlugin);

  const renderMarkdown: BubbleProps['messageRender'] = (content: any) => {
    return <div dangerouslySetInnerHTML={{ __html: md.render(content) }} />;
  };

  return {
    renderMarkdown,
  };
};
