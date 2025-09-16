import NiceModal from '@ebay/nice-modal-react';

import { WordHelper } from '../word-helper/WordHelper';

export const useWordHelper = () => {
  const showWordHelper = (word: string, reference: HTMLElement) => {
    NiceModal.show(WordHelper, { word, reference });
  };

  return {
    showWordHelper,
  };
};
