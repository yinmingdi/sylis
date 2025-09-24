import { AiFillOpenAI, AiOutlineBook, AiOutlineUser } from 'react-icons/ai';

export const tabs = [
  {
    Icon: AiOutlineBook,
    label: '背单词',
    path: '/vocabulary-learning',
  },
  // {
  //   Icon: AiOutlineRead,
  //   label: "阅读",
  //   path: "/reading",
  // },
  {
    Icon: AiFillOpenAI,
    label: 'AI',
    path: '/ai',
  },
  {
    Icon: AiOutlineUser,
    label: '我的',
    path: '/me',
  },
];

export const shouldShowTabbar = (pathname: string): boolean => {
  return tabs.some((tab) => pathname.startsWith(tab.path));
};
