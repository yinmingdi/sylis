import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Check } from "@sylis/components";

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: {
    children: "确认",
    tone: "primary",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["primary", "secondary", "danger", "quiet"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: Check,
    children: "完成",
  },
};
