// 「/」で出すメニュー（ポップアップとサイドパネルで共通）。中身と書き換えは lib/slash-commands.js。
//
// 行の頭か空白の直後で「/」か「／」を打つと開き、続けて打った文字で絞り込む。⌘/ でも開く。
// ↑↓ で選び、Enter か Tab で入れる。Esc を押すか、合う項目が無い文字を打つか、カーソルが離れると閉じる。
// フォーカスは入力欄に残したまま（打った文字で絞り込むため）。選んでいる項目は aria-activedescendant で伝える。
// 書式付きの入力欄と、記号のまま表示する入力欄の両方で使う。どちらを相手にするかは surface() が返す。

import { SLASH_TRIGGERS, applyCommand, filterCommands, findTrigger } from '../lib/slash-commands.js';

const MAX_QUERY = 20;

// surface() は今の入力欄。text()・cursor()・coords(pos)・apply(result)・composing()・hasFocus()・element() を持つ。
// onAction(action) は日時や URL のように、画面がする仕事を選んだとき
export function createSlashMenu({ box, surface, onAction }) {
  let open = false;
  let from = 0; // 「/」の場所。⌘/ で開いたときはカーソルの場所
  let typed = false; // 「/」を打って開いたか
  let items = [];
  let index = 0;

  function render() {
    box.replaceChildren(
      ...items.map((command, i) => {
        const option = document.createElement('div');
        option.className = 'menu-item slash-item';
        option.id = `slash-${command.id}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(i === index));
        const label = document.createElement('span');
        label.className = 'menu-label';
        label.textContent = command.label;
        option.append(label);
        if (command.hint) {
          const hint = document.createElement('kbd');
          hint.textContent = command.hint;
          option.append(hint);
        }
        // 押してもフォーカスは入力欄に残す
        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('click', () => pick(i));
        return option;
      }),
    );
    const target = surface().element();
    target.setAttribute('aria-controls', box.id);
    target.setAttribute('aria-activedescendant', `slash-${items[index].id}`);
    box.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  // カーソルのある行のすぐ下に出す。下に入らなければ上に出す
  function place() {
    const at = surface().coords(from);
    if (!at) return;
    const { width, height } = box.getBoundingClientRect();
    const below = at.bottom + 4;
    const top = below + height <= window.innerHeight - 4 ? below : Math.max(4, at.top - height - 4);
    box.style.top = `${top}px`;
    box.style.left = `${Math.max(4, Math.min(at.left, window.innerWidth - width - 4))}px`;
  }

  function show(at, byTyping) {
    open = true;
    from = at;
    typed = byTyping;
    items = [];
    index = 0;
    sync();
  }

  function close() {
    if (!open) return;
    open = false;
    if (box.matches(':popover-open')) box.hidePopover();
    const target = surface().element();
    target.removeAttribute('aria-activedescendant');
    target.removeAttribute('aria-controls');
  }

  // 本文やカーソルが変わったら、絞り込み直す。開いたままにできなければ閉じる
  function sync() {
    if (!open) return;
    const s = surface();
    const text = s.text();
    const cursor = s.cursor();
    const start = from + (typed ? 1 : 0);
    const query = text.slice(start, cursor);
    const valid =
      s.hasFocus() && cursor >= start && query.length <= MAX_QUERY && !/\s/.test(query) && (!typed || SLASH_TRIGGERS.includes(text[from]));
    const next = valid ? filterCommands(query) : [];
    if (!next.length) {
      close();
      return;
    }
    const current = items[index]?.id;
    items = next;
    index = Math.max(0, items.findIndex((command) => command.id === current));
    render();
    if (!box.matches(':popover-open')) box.showPopover();
    place();
  }

  function pick(i = index) {
    const command = items[i];
    if (!open || !command) return;
    const s = surface();
    const result = applyCommand(s.text(), from, s.cursor(), command.id);
    close();
    if (!result) return;
    s.apply(result);
    if (result.action) onAction(result.action);
  }

  return {
    isOpen: () => open,
    close,
    sync,
    // 書いたとき。inserted は入った文字。行の頭か空白の直後に「/」を打ったら開く
    edited(inserted) {
      if (open) {
        sync();
        return;
      }
      if (!inserted || !SLASH_TRIGGERS.includes(inserted.at(-1))) return;
      const s = surface();
      const trigger = findTrigger(s.text(), s.cursor());
      if (trigger && !trigger.query) show(trigger.from, true);
    },
    // ⌘/ で、カーソルの場所に開く
    openHere() {
      if (surface().composing()) return false;
      show(surface().cursor(), false);
      return true;
    },
    // 開いている間のキー。name は down・up・enter・escape。受け取ったら true
    key(name) {
      if (!open || surface().composing()) return false;
      if (name === 'escape') close();
      else if (name === 'enter') pick();
      else {
        index = (index + (name === 'down' ? 1 : -1) + items.length) % items.length;
        render();
      }
      return true;
    },
  };
}

// 記号のまま表示する入力欄で、pos 文字目のカーソルが画面のどこにあるか。
// 同じ幅・同じ文字の見えない箱に本文を入れて測る
export function textareaCoords(textarea, pos) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const name of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'wordBreak']) {
    mirror.style[name] = style[name];
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '-10000px',
    visibility: 'hidden',
    boxSizing: 'border-box',
    width: `${textarea.clientWidth}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  mirror.textContent = textarea.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = textarea.value.slice(pos, pos + 1) || '.';
  mirror.append(mark);
  document.body.append(mirror);
  const { offsetTop, offsetLeft, offsetHeight } = mark;
  mirror.remove();
  const rect = textarea.getBoundingClientRect();
  const top = rect.top + textarea.clientTop + offsetTop - textarea.scrollTop;
  return { left: rect.left + textarea.clientLeft + offsetLeft - textarea.scrollLeft, top, bottom: top + offsetHeight };
}
