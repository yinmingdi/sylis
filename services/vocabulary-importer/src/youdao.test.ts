import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeYoudaoEntry, parseYoudaoNdjson } from './youdao.js';

test('normalizes the complete historical Youdao content shape', () => {
  const entry = normalizeYoudaoEntry({
    word: 'set',
    trans: [{ pos: 'n.', tranCn: '一套；集合' }, { pos: 'v.', tranCn: '设置' }],
    sentence: { sentences: [{ sContent: 'Set the timer.', sCn: '设置计时器。' }] },
    realExamSentence: { sentences: [{ sContent: 'The set was complete.', sourceInfo: { level: 'CET4', year: '2020', type: '阅读' } }] },
    phrase: { phrases: [{ pContent: 'set up', pCn: '建立' }] },
    syno: { synos: [{ pos: 'v.', tran: 'establish', hwds: [{ w: 'establish' }] }] },
    antos: { antos: [{ pos: 'v.', tran: 'remove', hwds: [{ w: 'remove' }] }] },
    relWord: { rels: [{ pos: 'n.', words: [{ hwd: 'setting', tran: '环境' }] }] },
    remMethod: '把 set 想成设置',
    usphone: '/set/',
  });
  assert.equal(entry?.headword, 'set');
  assert.equal(entry?.senses.length, 2);
  assert.equal(entry?.examExamples[0]?.citation.level, 'CET4');
  assert.equal(entry?.synonyms[0]?.targetText, 'establish');
  assert.equal(entry?.antonyms[0]?.targetText, 'remove');
  assert.equal(entry?.wordFamily[0]?.targetText, 'setting');
});

test('parses private NDJSON without losing malformed lines', () => {
  const result = parseYoudaoNdjson(`${JSON.stringify({ word: 'alpha', trans: [{ pos: 'n.', tranCn: '阿尔法' }] })}\nnot-json`);
  assert.equal(result.length, 1);
});
