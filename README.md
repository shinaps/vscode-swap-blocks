# Swap Blocks

WebStormの「Move Statement」のように、コードブロックを上下にスワップできるVSCode拡張機能。

## インストール

最新版をワンコマンドでインストール:

```bash
gh release download --repo shinaps/vscode-swap-blocks --pattern "*.vsix" -O /tmp/swap-blocks.vsix && code --install-extension /tmp/swap-blocks.vsix
```

または [Releases](https://github.com/shinaps/vscode-swap-blocks/releases) からVSIXを手動ダウンロードして、VSCodeの拡張機能パネルで「Install from VSIX...」を選択してインストール。

## キーバインド

| キー | 動作 |
|------|------|
| `Cmd+Shift+↑` (Mac) / `Ctrl+Shift+↑` (Win/Linux) | ブロックを上に移動 |
| `Cmd+Shift+↓` (Mac) / `Ctrl+Shift+↓` (Win/Linux) | ブロックを下に移動 |

## 機能

### 関数ブロックのスワップ

関数を選択して上下に移動すると、隣の関数ブロックと丸ごとスワップします。部分選択でも関数の先頭行を含んでいれば自動的に関数全体に拡張されます。

```
// Before: groupByを選択してCmd+Shift+↓
function groupBy() { ... }    ←  選択
function debounce() { ... }

// After:
function debounce() { ... }
function groupBy() { ... }    ←  移動後
```

### 複数ブロックの一括移動

複数の関数を選択して移動すると、まとめて1つのブロックとしてスワップします。

### ブロック内への移動

任意の行を選択して移動すると、閉じ括弧を越えてブロック内に出入りできます。

```
// Before: 2行を選択してCmd+Shift+↑
const setCounter = (count: number) => {
  counter = count;
};
element.addEventListener(...);    ←  選択
setCounter(0);                    ←  選択

// After: };を越えてブロック内に入る
const setCounter = (count: number) => {
  counter = count;
  element.addEventListener(...);  ←  移動後
  setCounter(0);                  ←  移動後
};
```

## 開発

```bash
bun install
bun run compile
bun run watch    # 開発時
```

テスト:

```bash
bun run compile && node --test out/core.test.js
```
