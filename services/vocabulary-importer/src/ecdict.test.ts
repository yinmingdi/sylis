import assert from 'node:assert/strict';
import test from 'node:test';

import { selectEcdictRow } from './ecdict.js';

test('selects exam-tagged words and parses meanings', () => {
  const word = selectEcdictRow({
    word: ' Example ',
    phonetic: "iɡ'zɑːmpəl",
    translation: 'n. 例子\nv. 举例说明',
    definition: 'a representative form',
    tag: 'cet4 gk',
    collins: '3',
  });

  assert.equal(word?.headword, 'example');
  assert.equal(word?.star, 3);
  assert.deepEqual(word?.metadata.tags, ['cet4', 'gk']);
  assert.deepEqual(
    word?.meanings.map((meaning) => meaning.partOfSpeech),
    ['n', 'v'],
  );
});

test('selects top-frequency and Oxford words', () => {
  assert.ok(selectEcdictRow({ word: 'alpha', bnc: '29999' }));
  assert.ok(selectEcdictRow({ word: 'beta', oxford: '1' }));
  assert.equal(selectEcdictRow({ word: 'gamma', bnc: '30001' }), null);
});
