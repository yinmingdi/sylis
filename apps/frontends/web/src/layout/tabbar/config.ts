import {
  AiFillOpenAI,
  AiOutlineBook,
  AiOutlineCompass,
  AiOutlineUser,
} from 'react-icons/ai';

export const tabs = [
  {
    Icon: AiOutlineBook,
    label: '背单词',
    path: '/vocabulary-learning',
  },
  {
    Icon: AiFillOpenAI,
    label: 'AI',
    path: '/ai',
  },
  {
    Icon: AiOutlineCompass,
    label: '探索',
    path: '/explore',
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
