// 「/」で出すメニューの中身と、選んだときの書き換え。画面を持たないので node で試せる。
//
// メニューは、行の頭か空白の直後で「/」か「／」を打つと開く（日付の 2026/11/01 や URL の中では開かない）。
// 日本語の入力中は / キーが「・」になるので、⌘/ でも開く（ui/slash-menu.js）。
// 「/」の後ろに打った文字で絞り込む。日本語の名前・ひらがなの読み・英語の名前のどれでもよい。
// 選んだら「/」と打った文字を消し、行を見出しやリストにするか、表などのまとまりを入れる。
// 日時と URL は画面の仕事なので、action だけを返す（「日時を入れる」「URL を入れる」のボタンと同じことをする）。

export const SLASH_TRIGGERS = ['/', '／'];
const MAX_QUERY = 20;

export const SLASH_COMMANDS = [
  { id: 'h1', label: '見出し 1', hint: '#', words: ['見出し1', 'みだし1', 'h1', 'heading1'] },
  { id: 'h2', label: '見出し 2', hint: '##', words: ['見出し2', 'みだし2', 'h2', 'heading2'] },
  { id: 'h3', label: '見出し 3', hint: '###', words: ['見出し3', 'みだし3', 'h3', 'heading3'] },
  { id: 'bullet', label: '箇条書き', hint: '-', words: ['箇条書き', 'かじょうがき', 'りすと', 'list', 'bullet', 'ul'] },
  { id: 'number', label: '番号付きリスト', hint: '1.', words: ['番号付きリスト', 'ばんごう', 'りすと', 'number', 'numbered', 'list', 'ol'] },
  { id: 'task', label: 'チェックボックス', hint: '[ ]', words: ['チェックボックス', 'ちぇっく', 'やること', 'todo', 'task', 'check'] },
  { id: 'table', label: '表', hint: '| |', words: ['表', 'ひょう', 'てーぶる', 'table'] },
  { id: 'code', label: 'コード', hint: '```', words: ['こーど', 'code'] },
  { id: 'quote', label: '引用', hint: '>', words: ['引用', 'いんよう', 'quote'] },
  { id: 'hr', label: '区切り線', hint: '---', words: ['区切り線', 'くぎりせん', 'せん', 'hr', 'line', 'divider'] },
  { id: 'date', label: '日時', hint: '', words: ['日時', 'にちじ', '日付', 'ひづけ', '時間', 'じかん', '今日', 'きょう', 'date', 'time', 'now'] },
  { id: 'url', label: 'ページの URL', hint: '', words: ['url', 'ぺーじ', 'りんく', 'link', 'page'] },
];

// 全角の英数字は半角に、カタカナはひらがなに、英字は小文字にそろえる
export function normalizeQuery(text) {
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

const NORMALIZED = SLASH_COMMANDS.map((command) => ({ command, keys: [command.label, ...command.words].map(normalizeQuery) }));

// query に合う項目。名前か読みの頭が合うものを先に、途中が合うものを後に並べる
export function filterCommands(query) {
  const q = normalizeQuery(query);
  if (!q) return SLASH_COMMANDS;
  const head = NORMALIZED.filter(({ keys }) => keys.some((key) => key.startsWith(q)));
  const inside = NORMALIZED.filter((item) => !head.includes(item) && item.keys.some((key) => key.includes(q)));
  return [...head, ...inside].map(({ command }) => command);
}

// pos の手前に、メニューを開いたままにしてよい「/」があれば、その場所と打った文字を返す。
// 「/」は行の頭か空白の直後にあり、そこから pos まで空白も改行も無いこと
export function findTrigger(text, pos) {
  const lineFrom = text.lastIndexOf('\n', pos - 1) + 1;
  for (let i = pos - 1; i >= lineFrom && pos - i <= MAX_QUERY + 1; i--) {
    const c = text[i];
    if (/\s/.test(c)) return null;
    if (!SLASH_TRIGGERS.includes(c)) continue;
    if (i > lineFrom && !/\s/.test(text[i - 1])) return null;
    return { from: i, query: text.slice(i + 1, pos) };
  }
  return null;
}

const QUOTE_PREFIX_RE = /^(?: {0,3}>[ \t　]?)*/;
// 見出しやリストの記号（付け替えるときに外す）
const MARKUP_RE = /^(?: {0,3}#{1,6}[ \t　]+|(?:[-*+]|\d{1,9}[.)])[ \t　]+(?:\[[ xX]\][ \t　]+)?)/;

const LINE_PREFIX = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', number: '1. ', task: '- [ ] ' };
const TABLE = ['| 項目 | 内容 |', '| --- | --- |', '|  |  |'];

// 本文の from から to まで（「/」と打った文字）を消して、id の項目を当てる
export function applyCommand(text, from, to, id) {
  const lineFrom = text.lastIndexOf('\n', from - 1) + 1;
  const nl = text.indexOf('\n', to);
  const lineTo = nl === -1 ? text.length : nl;
  const before = text.slice(lineFrom, from);
  const after = text.slice(to, lineTo);
  const quote = before.match(QUOTE_PREFIX_RE)[0];
  const rest = before.slice(quote.length) + after;
  const replaceLine = (line, cursor) => ({
    changes: [{ from: lineFrom, to: lineTo, insert: line }],
    selection: { anchor: lineFrom + cursor[0], head: lineFrom + (cursor[1] ?? cursor[0]) },
  });

  if (id === 'date' || id === 'url') {
    return { changes: [{ from, to, insert: '' }], selection: { anchor: from, head: from }, action: id };
  }

  if (id in LINE_PREFIX || id === 'quote') {
    // 見出しは字下げしない。リストは今の字下げを残す
    const space = rest.match(/^[ \t　]*/)[0];
    const indent = /^h\d$/.test(id) ? '' : space;
    const content = id === 'quote' ? rest : rest.slice(space.length).replace(MARKUP_RE, '');
    const line = id === 'quote' ? `> ${quote}${rest}` : `${quote}${indent}${LINE_PREFIX[id]}${content}`;
    // カーソルは、消した「/」があった所。後ろの文字の手前
    return replaceLine(line, [line.length - Math.min(after.length, content.length)]);
  }

  // 表・コード・区切り線は、まとまりとして別の行に入れる。前後に文字があれば、その行は残す
  const head = before.trimEnd() !== quote.trimEnd() ? `${before.trimEnd()}\n` : '';
  const tail = after.trim() ? `\n${quote}${after.trimStart()}` : '';
  const block = (lines) => lines.map((line) => quote + line).join('\n');
  let body;
  let cursor;
  if (id === 'table') {
    body = block(TABLE);
    // 見出しの「項目」を選んでおき、そのまま書き換えられるようにする
    const at = head.length + quote.length + 2;
    cursor = [at, at + 2];
  } else if (id === 'code') {
    body = block(['```', '', '```']);
    const at = head.length + quote.length + 3 + 1 + quote.length;
    cursor = [at];
  } else if (id === 'hr') {
    body = block(['---', '']);
    cursor = [head.length + body.length];
  } else {
    return null;
  }
  return replaceLine(head + body + tail, cursor);
}
