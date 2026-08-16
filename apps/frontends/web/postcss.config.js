export default {
  plugins: {
    'postcss-pxtorem': {
      rootValue: 16, // 根字体大小，对应 1rem = 16px
      unitPrecision: 5, // rem 的小数位数
      propList: ['*', '!border*', '!box-shadow'], // 需要转换的属性列表，! 表示排除
      selectorBlackList: ['.ignore', '.hairlines'], // 忽略的选择器，不会被转换
      replace: true, // 替换而不是添加回退
      mediaQuery: false, // 是否在媒体查询的 css 代码中也进行转换
      minPixelValue: 2, // 设置最小的转换数值，小于这个值不转换
      exclude: /node_modules/i, // 排除 node_modules 文件夹
    },
  },
};
