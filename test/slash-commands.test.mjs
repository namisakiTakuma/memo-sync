// 「/」で出すメニューの絞り込みと、選んだときの書き換え

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH_COMMANDS, applyCommand, filterCommands, findTrigger } from '../extension/lib/slash-commands.js';
import { applyChanges } from '../extension/lib/edit-keys.js';

const ids = (query) => filterCommands(query).map((command) => command.id);

test('日本語の名前・ひらがなの読み・カタカナ・英語・全角のどれでも絞り込める', () => {
  assert.equal(ids('').length, SLASH_COMMANDS.length);
  for (const query of ['表', 'ひょう', 'てーぶる', 'テーブル', 'ﾃｰﾌﾞﾙ', 'table', 'ＴＡＢＬＥ']) assert.deepEqual(ids(query), ['table'], query);
  assert.deepEqual(ids('みだし'), ['h1', 'h2', 'h3']);
  assert.deepEqual(ids('見出し2'), ['h2']);
  assert.deepEqual(ids('りすと'), ['bullet', 'number']);
  assert.deepEqual(ids('チェ'), ['task']);
  assert.deepEqual(ids('zzz'), []);
  // 頭が合うものを先に出す
  assert.deepEqual(ids('h').slice(0, 4), ['h1', 'h2', 'h3', 'hr']);
});

test('メニューを開くのは、行の頭か空白の直後の「/」だけ', () => {
  assert.deepEqual(findTrigger('/', 1), { from: 0, query: '' });
  assert.deepEqual(findTrigger('予定 /ひょう', 7), { from: 3, query: 'ひょう' });
  assert.deepEqual(findTrigger('一行目\n／み', 6), { from: 4, query: 'み' });
  assert.equal(findTrigger('2026/11', 7), null);
  assert.equal(findTrigger('https://a', 9), null);
  assert.equal(findTrigger('/a b', 4), null);
});

function run(text, from, to, id) {
  const result = applyCommand(text, from, to, id);
  const next = applyChanges(text, result.changes);
  return [next, next.slice(result.selection.anchor, result.selection.head), result.selection.anchor, result.action];
}

test('見出しとリストは、行の記号を付け替える。カーソルは「/」があった所に置く', () => {
  assert.deepEqual(run('/み', 0, 2, 'h2'), ['## ', '', 3, undefined]);
  assert.deepEqual(run('今日の予定 /み', 6, 8, 'h1'), ['# 今日の予定 ', '', 8, undefined]);
  assert.deepEqual(run('# 見出し /', 6, 7, 'bullet'), ['- 見出し ', '', 6, undefined]);
  assert.deepEqual(run('  - 項目 /', 7, 8, 'task'), ['  - [ ] 項目 ', '', 11, undefined]);
  assert.deepEqual(run('> /', 2, 3, 'number'), ['> 1. ', '', 5, undefined]);
  assert.deepEqual(run('引用したい /', 6, 7, 'quote'), ['> 引用したい ', '', 8, undefined]);
});

test('表・コード・区切り線は別の行に入れ、前後の文字は残す', () => {
  assert.deepEqual(run('/表', 0, 2, 'table'), ['| 項目 | 内容 |\n| --- | --- |\n|  |  |', '項目', 2, undefined]);
  assert.deepEqual(run('前 /表 後', 2, 4, 'table')[0], '前\n| 項目 | 内容 |\n| --- | --- |\n|  |  |\n後');
  assert.deepEqual(run('/こ', 0, 2, 'code'), ['```\n\n```', '', 4, undefined]);
  assert.deepEqual(run('> /こ', 2, 4, 'code'), ['> ```\n> \n> ```', '', 8, undefined]);
  assert.deepEqual(run('/区', 0, 2, 'hr'), ['---\n', '', 4, undefined]);
});

test('日時と URL は「/」を消して、画面の仕事を返す', () => {
  assert.deepEqual(run('メモ /にち', 3, 6, 'date'), ['メモ ', '', 3, 'date']);
  assert.deepEqual(run('/url', 0, 4, 'url'), ['', '', 0, 'url']);
});
