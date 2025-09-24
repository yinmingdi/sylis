import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: {
        contentsSelector: ".sbdocs-content",
        headingSelector: "h1, h2, h3",
        title: "Table of Contents",
      },
    },
  },
};

export default preview;
