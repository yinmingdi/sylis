/**
 * 动态设置根字体大小，实现 rem 适配
 * @param designWidth 设计稿宽度，默认 414px（移动端常见宽度）
 * @param baseSize 基准字体大小，默认 16px（对应 1rem = 16px）
 * @param minFontSize 最小根字体大小（像素），默认 12px，防止过度缩小
 * @param maxFontSize 最大根字体大小（像素），默认 24px，防止过度放大
 */
export function setRem(
  designWidth = 414,
  baseSize = 16,
  minFontSize = 12,
  maxFontSize = 18,
) {
  function setRootFontSize() {
    const screenWidth =
      window.innerWidth ||
      document.documentElement.clientWidth ||
      document.body.clientWidth;

    // 计算缩放比例
    const scale = screenWidth / designWidth;
    // 计算根字体大小
    let fontSize = baseSize * scale;

    // 限制在最小和最大字体大小之间
    fontSize = Math.max(minFontSize, Math.min(fontSize, maxFontSize));

    // 设置根字体大小
    document.documentElement.style.fontSize = `${fontSize}px`;
  }

  // 初始化设置
  setRootFontSize();

  // 监听窗口大小变化
  window.addEventListener('resize', setRootFontSize);

  // 监听屏幕方向变化（移动端）
  window.addEventListener('orientationchange', setRootFontSize);

  // 返回清理函数，用于组件卸载时移除监听器
  return () => {
    window.removeEventListener('resize', setRootFontSize);
    window.removeEventListener('orientationchange', setRootFontSize);
  };
}
