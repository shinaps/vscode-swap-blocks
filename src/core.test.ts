import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { swapBlocks, findAdjacentBlock, expandToFoldingRange, normalizeFoldRange, type BlockRange } from "./core.js";

const counterTsLines = [
  "export function setupCounter(element: HTMLButtonElement) {", // 0
  "  let counter = 0;",                                         // 1
  "  const setCounter = (count: number) => {",                  // 2
  "    counter = count;",                                        // 3
  '    element.innerHTML = `Count is ${counter}`;',              // 4
  "  };",                                                        // 5
  "",                                                            // 6
  '  element.addEventListener("click", () => setCounter(counter + 1));', // 7
  "  setCounter(0);",                                            // 8
  "}",                                                           // 9
];

// フォールディング範囲: VSCodeがTypeScriptに対して返す想定
const foldingRanges: BlockRange[] = [
  { start: 0, end: 9 }, // function body
  { start: 2, end: 5 }, // arrow function body
];

describe("swapBlocks", () => {
  describe("counter.ts: 選択行7-8を下に移動", () => {
    it("選択した行と閉じ括弧がスワップされる", () => {
      const selection: BlockRange = { start: 7, end: 8 };
      const result = swapBlocks(counterTsLines, selection, 7, "down", foldingRanges);

      assert.ok(result);

      const expected = [
        "export function setupCounter(element: HTMLButtonElement) {",
        "  let counter = 0;",
        "  const setCounter = (count: number) => {",
        "    counter = count;",
        '    element.innerHTML = `Count is ${counter}`;',
        "  };",
        "",
        "}",
        '  element.addEventListener("click", () => setCounter(counter + 1));',
        "  setCounter(0);",
      ];

      assert.deepStrictEqual(result!.newLines, expected);
    });

    it("スワップ後の選択範囲が正しい", () => {
      const selection: BlockRange = { start: 7, end: 8 };
      const result = swapBlocks(counterTsLines, selection, 7, "down", foldingRanges);

      assert.ok(result);
      assert.deepStrictEqual(result!.newSelection, { start: 8, end: 9 });
    });
  });

  describe("counter.ts: 選択行7-8を上に移動", () => {
    it("選択した行と};+空行がスワップされる", () => {
      const selection: BlockRange = { start: 7, end: 8 };
      const result = swapBlocks(counterTsLines, selection, 7, "up", foldingRanges);

      assert.ok(result);

      const expected = [
        "export function setupCounter(element: HTMLButtonElement) {",
        "  let counter = 0;",
        "  const setCounter = (count: number) => {",
        "    counter = count;",
        '    element.innerHTML = `Count is ${counter}`;',
        '  element.addEventListener("click", () => setCounter(counter + 1));',
        "  setCounter(0);",
        "",
        "  };",
        "}",
      ];

      assert.deepStrictEqual(result!.newLines, expected);
    });

    it("スワップ後の選択範囲が正しい", () => {
      const selection: BlockRange = { start: 7, end: 8 };
      const result = swapBlocks(counterTsLines, selection, 7, "up", foldingRanges);

      assert.ok(result);
      assert.deepStrictEqual(result!.newSelection, { start: 5, end: 6 });
    });
  });

  describe("境界ケース", () => {
    it("最上行で上に移動 → undefined", () => {
      const selection: BlockRange = { start: 0, end: 0 };
      const result = swapBlocks(counterTsLines, selection, 0, "up", foldingRanges);
      assert.strictEqual(result, undefined);
    });

    it("最下行で下に移動 → undefined", () => {
      const selection: BlockRange = { start: 9, end: 9 };
      const result = swapBlocks(counterTsLines, selection, 9, "down", foldingRanges);
      assert.strictEqual(result, undefined);
    });

    it("単一行を下に移動", () => {
      const lines = ["aaa", "bbb", "ccc"];
      const selection: BlockRange = { start: 0, end: 0 };
      const result = swapBlocks(lines, selection, 0, "down", []);

      assert.ok(result);
      assert.deepStrictEqual(result!.newLines, ["bbb", "aaa", "ccc"]);
      assert.deepStrictEqual(result!.newSelection, { start: 1, end: 1 });
    });

    it("単一行を上に移動", () => {
      const lines = ["aaa", "bbb", "ccc"];
      const selection: BlockRange = { start: 2, end: 2 };
      const result = swapBlocks(lines, selection, 2, "up", []);

      assert.ok(result);
      assert.deepStrictEqual(result!.newLines, ["aaa", "ccc", "bbb"]);
      assert.deepStrictEqual(result!.newSelection, { start: 1, end: 1 });
    });

    it("空行をまたいでスワップ（ギャップ維持）", () => {
      const lines = ["aaa", "", "bbb"];
      const selection: BlockRange = { start: 2, end: 2 };
      const result = swapBlocks(lines, selection, 2, "up", []);

      assert.ok(result);
      assert.deepStrictEqual(result!.newLines, ["bbb", "", "aaa"]);
      assert.deepStrictEqual(result!.newSelection, { start: 0, end: 0 });
    });
  });

  describe("フォールディング範囲を使った隣接ブロック検出", () => {
    it("DOWN: 隣接行がフォールディング範囲の開始行なら範囲全体を飛び越す", () => {
      const lines = ["aaa", "if (x) {", "  foo();", "}", "bbb"];
      const folds: BlockRange[] = [{ start: 1, end: 3 }];
      const selection: BlockRange = { start: 0, end: 0 };
      const result = swapBlocks(lines, selection, 0, "down", folds);

      assert.ok(result);
      assert.deepStrictEqual(result!.newLines, ["if (x) {", "  foo();", "}", "aaa", "bbb"]);
      assert.deepStrictEqual(result!.newSelection, { start: 3, end: 3 });
    });

    it("UP: 閉じ括弧を越えてブロック内に入る（単一行スワップ）", () => {
      const lines = ["aaa", "if (x) {", "  foo();", "}", "bbb"];
      const folds: BlockRange[] = [{ start: 1, end: 3 }];
      const selection: BlockRange = { start: 4, end: 4 };
      const result = swapBlocks(lines, selection, 4, "up", folds);

      assert.ok(result);
      // bbb が } と入れ替わり、ブロック内に移動する
      assert.deepStrictEqual(result!.newLines, ["aaa", "if (x) {", "  foo();", "bbb", "}"]);
      assert.deepStrictEqual(result!.newSelection, { start: 3, end: 3 });
    });
  });
});

describe("ブロック同士のスワップ（関数単位）", () => {
  // 複数関数が並ぶファイルを模擬
  const multiFuncLines = [
    "function add(a, b) {",    // 0
    "  return a + b;",          // 1
    "}",                        // 2
    "",                         // 3
    "function multiply(a, b) {", // 4
    "  return a * b;",          // 5
    "}",                        // 6
    "",                         // 7
    "function subtract(a, b) {", // 8
    "  return a - b;",          // 9
    "}",                        // 10
  ];

  const multiFuncFolds: BlockRange[] = [
    { start: 0, end: 2 },  // add
    { start: 4, end: 6 },  // multiply
    { start: 8, end: 10 }, // subtract
  ];

  it("完全なブロック選択でUP: 隣の関数丸ごとスワップ", () => {
    // multiply (4-6) を上に移動 → add (0-2) とスワップ
    const selection: BlockRange = { start: 4, end: 6 };
    const result = swapBlocks(multiFuncLines, selection, 4, "up", multiFuncFolds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function multiply(a, b) {",
      "  return a * b;",
      "}",
      "",
      "function add(a, b) {",
      "  return a + b;",
      "}",
      "",
      "function subtract(a, b) {",
      "  return a - b;",
      "}",
    ]);
    assert.deepStrictEqual(result!.newSelection, { start: 0, end: 2 });
  });

  it("完全なブロック選択でDOWN: 隣の関数丸ごとスワップ", () => {
    // multiply (4-6) を下に移動 → subtract (8-10) とスワップ
    const selection: BlockRange = { start: 4, end: 6 };
    const result = swapBlocks(multiFuncLines, selection, 4, "down", multiFuncFolds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function add(a, b) {",
      "  return a + b;",
      "}",
      "",
      "function subtract(a, b) {",
      "  return a - b;",
      "}",
      "",
      "function multiply(a, b) {",
      "  return a * b;",
      "}",
    ]);
    assert.deepStrictEqual(result!.newSelection, { start: 8, end: 10 });
  });

  it("複数ブロック選択でDOWN: 2つの関数が一緒に下に移動", () => {
    // add + multiply (0-6) を選択して下に移動 → subtract (8-10) とスワップ
    const selection: BlockRange = { start: 0, end: 6 };
    const result = swapBlocks(multiFuncLines, selection, 0, "down", multiFuncFolds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function subtract(a, b) {",
      "  return a - b;",
      "}",
      "",
      "function add(a, b) {",
      "  return a + b;",
      "}",
      "",
      "function multiply(a, b) {",
      "  return a * b;",
      "}",
    ]);
  });

  it("複数ブロック選択でUP: 2つの関数が一緒に上に移動", () => {
    // multiply + subtract (4-10) を選択して上に移動 → add (0-2) とスワップ
    const selection: BlockRange = { start: 4, end: 10 };
    const result = swapBlocks(multiFuncLines, selection, 4, "up", multiFuncFolds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function multiply(a, b) {",
      "  return a * b;",
      "}",
      "",
      "function subtract(a, b) {",
      "  return a - b;",
      "}",
      "",
      "function add(a, b) {",
      "  return a + b;",
      "}",
    ]);
  });

  it("複数ブロック（空行含む選択）でUP: ブロックごとスワップ", () => {
    // 空行(3) + multiply + 空行(7) + subtract (3-10) を選択して上に移動
    const selection: BlockRange = { start: 3, end: 10 };
    const result = swapBlocks(multiFuncLines, selection, 4, "up", multiFuncFolds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function multiply(a, b) {",
      "  return a * b;",
      "}",
      "",
      "function subtract(a, b) {",
      "  return a - b;",
      "}",
      "",
      "function add(a, b) {",
      "  return a + b;",
      "}",
    ]);
  });

  it("任意の行選択でUP: ブロック展開しない（従来の挙動）", () => {
    // counter.tsで行7-8を上に → };とだけスワップ（ブロック内に入る）
    const selection: BlockRange = { start: 7, end: 8 };
    const result = swapBlocks(counterTsLines, selection, 7, "up", foldingRanges);

    assert.ok(result);
    // 従来通り };(line5) とスワップ
    assert.strictEqual(result!.newLines[5],
      '  element.addEventListener("click", () => setCounter(counter + 1));');
    assert.strictEqual(result!.newLines[8], "  };");
  });
});

describe("findAdjacentBlock", () => {
  it("上方向で空行をスキップする", () => {
    const lines = ["aaa", "", "bbb"];
    const result = findAdjacentBlock(lines, { start: 2, end: 2 }, "up", []);
    assert.deepStrictEqual(result, { start: 0, end: 0 });
  });

  it("下方向で空行をスキップする", () => {
    const lines = ["aaa", "", "bbb"];
    const result = findAdjacentBlock(lines, { start: 0, end: 0 }, "down", []);
    assert.deepStrictEqual(result, { start: 2, end: 2 });
  });

  it("DOWN: フォールディング範囲の開始行なら全体を返す", () => {
    const lines = ["aaa", "fn() {", "  x", "}", "bbb"];
    const folds: BlockRange[] = [{ start: 1, end: 3 }];
    const result = findAdjacentBlock(lines, { start: 0, end: 0 }, "down", folds);
    assert.deepStrictEqual(result, { start: 1, end: 3 });
  });

  it("UP: 閉じ括弧でもフォールディング範囲を展開しない（単一行）", () => {
    const lines = counterTsLines;
    const result = findAdjacentBlock(lines, { start: 7, end: 8 }, "up", foldingRanges);
    assert.deepStrictEqual(result, { start: 5, end: 5 });
  });
});

describe("expandToFoldingRange", () => {
  const simpleLines = ["fn() {", "  a", "  b", "  c", "  d", "  e", "}"];

  it("選択がフォールディング範囲の開始行から始まっていれば拡張する", () => {
    const folds: BlockRange[] = [{ start: 0, end: 5 }];
    const result = expandToFoldingRange({ start: 0, end: 3 }, folds, simpleLines);
    // fold {0,5} → normalized to {0,6} (line 6 is "}")
    assert.deepStrictEqual(result, { start: 0, end: 6 });
  });

  it("選択がフォールディング範囲と完全一致ならそのまま（正規化含む）", () => {
    const folds: BlockRange[] = [{ start: 0, end: 5 }];
    const result = expandToFoldingRange({ start: 0, end: 6 }, folds, simpleLines);
    assert.deepStrictEqual(result, { start: 0, end: 6 });
  });

  it("選択がフォールディング範囲の途中から始まっていれば拡張しない", () => {
    const folds: BlockRange[] = [{ start: 0, end: 5 }];
    const result = expandToFoldingRange({ start: 2, end: 4 }, folds, simpleLines);
    assert.deepStrictEqual(result, { start: 2, end: 4 });
  });

  it("部分選択した関数が丸ごとスワップされる", () => {
    const lines = [
      "function groupBy() {",    // 0
      "  const result = {};",     // 1
      "  for (const item of items) {", // 2
      "    // ...",                // 3
      "  }",                      // 4
      "  return result;",         // 5
      "}",                        // 6
      "",                         // 7
      "function debounce() {",    // 8
      "  let timer;",             // 9
      "  return () => {};",       // 10
      "}",                        // 11
    ];
    const folds: BlockRange[] = [
      { start: 0, end: 5 },  // groupBy (} on line 6 NOT included - VSCode style)
      { start: 2, end: 3 },  // for loop
      { start: 8, end: 10 }, // debounce (} on line 11 NOT included)
    ];

    // 行0-3のみ選択（groupByの一部）→ 行0-6に拡張されるはず
    const selection: BlockRange = { start: 0, end: 3 };
    const result = swapBlocks(lines, selection, 0, "down", folds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      "function debounce() {",
      "  let timer;",
      "  return () => {};",
      "}",
      "",
      "function groupBy() {",
      "  const result = {};",
      "  for (const item of items) {",
      "    // ...",
      "  }",
      "  return result;",
      "}",
    ]);
  });
});

describe("VSCodeの実際のフォールディング範囲（閉じ括弧を含まない）", () => {
  // ユーザー報告のバグケース: groupByを選択して下に移動
  const lines = [
    'export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {', // 0
    '  const result: Record<string, T[]> = {};',  // 1
    '  for (const item of items) {',               // 2
    '    const groupKey = String(item[key]);',      // 3
    '    if (!result[groupKey]) {',                 // 4
    '      result[groupKey] = [];',                 // 5
    '    }',                                        // 6
    '    result[groupKey].push(item);',             // 7
    '  }',                                          // 8
    '  return result;',                             // 9
    '}',                                            // 10
    '',                                             // 11
    'export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {', // 12
    '  let timer: ReturnType<typeof setTimeout>;',  // 13
    '  return ((...args: unknown[]) => {',          // 14
    '    clearTimeout(timer);',                     // 15
    '    timer = setTimeout(() => fn(...args), delay);', // 16
    '  }) as T;',                                   // 17
    '}',                                            // 18
  ];

  // VSCodeの実際のフォールディング範囲: 閉じ括弧を含まない
  const folds: BlockRange[] = [
    { start: 0, end: 9 },   // groupBy (line 10の}は含まない)
    { start: 2, end: 7 },   // for loop
    { start: 4, end: 5 },   // if block
    { start: 12, end: 17 }, // debounce (line 18の}は含まない)
    { start: 14, end: 16 }, // arrow function
  ];

  it("groupBy全体を選択してDOWN: debounceと丸ごとスワップ", () => {
    const selection: BlockRange = { start: 0, end: 10 };
    const result = swapBlocks(lines, selection, 0, "down", folds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      'export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {',
      '  let timer: ReturnType<typeof setTimeout>;',
      '  return ((...args: unknown[]) => {',
      '    clearTimeout(timer);',
      '    timer = setTimeout(() => fn(...args), delay);',
      '  }) as T;',
      '}',
      '',
      'export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {',
      '  const result: Record<string, T[]> = {};',
      '  for (const item of items) {',
      '    const groupKey = String(item[key]);',
      '    if (!result[groupKey]) {',
      '      result[groupKey] = [];',
      '    }',
      '    result[groupKey].push(item);',
      '  }',
      '  return result;',
      '}',
    ]);
  });

  it("groupByの一部を選択してDOWN: 関数全体に拡張されてスワップ", () => {
    // ユーザーが行0-7だけ選択（関数の一部）
    const selection: BlockRange = { start: 0, end: 7 };
    const result = swapBlocks(lines, selection, 0, "down", folds);

    assert.ok(result);
    // groupBy全体(0-10)とdebounce全体(12-18)がスワップされるべき
    assert.deepStrictEqual(result!.newLines, [
      'export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {',
      '  let timer: ReturnType<typeof setTimeout>;',
      '  return ((...args: unknown[]) => {',
      '    clearTimeout(timer);',
      '    timer = setTimeout(() => fn(...args), delay);',
      '  }) as T;',
      '}',
      '',
      'export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {',
      '  const result: Record<string, T[]> = {};',
      '  for (const item of items) {',
      '    const groupKey = String(item[key]);',
      '    if (!result[groupKey]) {',
      '      result[groupKey] = [];',
      '    }',
      '    result[groupKey].push(item);',
      '  }',
      '  return result;',
      '}',
    ]);
  });

  it("ブロック上の空行を含めて選択してDOWN: ブロックごとスワップされる", () => {
    // 空行(11) + debounce(12-18) を選択してしまった場合
    const selection: BlockRange = { start: 11, end: 18 };
    const result = swapBlocks(lines, selection, 12, "down", folds);

    // debounceの下にブロックがないのでundefined
    assert.strictEqual(result, undefined);
  });

  it("ブロック上の空行を含めて選択してUP: ブロックごとスワップされる", () => {
    // 空行(11) + debounce(12-18) を選択してしまった場合
    const selection: BlockRange = { start: 11, end: 18 };
    const result = swapBlocks(lines, selection, 12, "up", folds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      'export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {',
      '  let timer: ReturnType<typeof setTimeout>;',
      '  return ((...args: unknown[]) => {',
      '    clearTimeout(timer);',
      '    timer = setTimeout(() => fn(...args), delay);',
      '  }) as T;',
      '}',
      '',
      'export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {',
      '  const result: Record<string, T[]> = {};',
      '  for (const item of items) {',
      '    const groupKey = String(item[key]);',
      '    if (!result[groupKey]) {',
      '      result[groupKey] = [];',
      '    }',
      '    result[groupKey].push(item);',
      '  }',
      '  return result;',
      '}',
    ]);
  });

  it("debounce全体を選択してUP: groupByと丸ごとスワップ", () => {
    const selection: BlockRange = { start: 12, end: 18 };
    const result = swapBlocks(lines, selection, 12, "up", folds);

    assert.ok(result);
    assert.deepStrictEqual(result!.newLines, [
      'export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {',
      '  let timer: ReturnType<typeof setTimeout>;',
      '  return ((...args: unknown[]) => {',
      '    clearTimeout(timer);',
      '    timer = setTimeout(() => fn(...args), delay);',
      '  }) as T;',
      '}',
      '',
      'export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {',
      '  const result: Record<string, T[]> = {};',
      '  for (const item of items) {',
      '    const groupKey = String(item[key]);',
      '    if (!result[groupKey]) {',
      '      result[groupKey] = [];',
      '    }',
      '    result[groupKey].push(item);',
      '  }',
      '  return result;',
      '}',
    ]);
  });
});

describe("normalizeFoldRange", () => {
  it("次の行が閉じ括弧なら範囲を拡張する", () => {
    const lines = ["fn() {", "  a", "  b", "}"];
    const result = normalizeFoldRange({ start: 0, end: 2 }, lines);
    assert.deepStrictEqual(result, { start: 0, end: 3 });
  });

  it("次の行が閉じ括弧でなければそのまま", () => {
    const lines = ["fn() {", "  a", "  b", "next"];
    const result = normalizeFoldRange({ start: 0, end: 2 }, lines);
    assert.deepStrictEqual(result, { start: 0, end: 2 });
  });

  it("範囲の末尾がファイル末尾ならそのまま", () => {
    const lines = ["fn() {", "  a"];
    const result = normalizeFoldRange({ start: 0, end: 1 }, lines);
    assert.deepStrictEqual(result, { start: 0, end: 1 });
  });
});
