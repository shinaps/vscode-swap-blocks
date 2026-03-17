export interface BlockRange {
  /** 0-indexed start line */
  start: number;
  /** 0-indexed end line (inclusive) */
  end: number;
}

export interface SwapResult {
  /** The new lines after swapping */
  newLines: string[];
  /** The new selection range for the moved block */
  newSelection: BlockRange;
}

/**
 * VSCodeのフォールディング範囲は閉じ括弧を含まないことがある。
 * 次の行が閉じ括弧なら範囲を拡張する。
 */
export function normalizeFoldRange(
  range: BlockRange,
  lines: string[]
): BlockRange {
  const nextLine = range.end + 1;
  if (nextLine < lines.length && /^\s*[}\])]/.test(lines[nextLine])) {
    return { start: range.start, end: nextLine };
  }
  return range;
}

/**
 * 選択範囲がなければ、フォールディング範囲からブロックを特定する。
 * カーソル行を含む最も内側のフォールディング範囲を返す。
 * 見つからなければカーソル行のみを返す。
 */
export function findBlockFromFolding(
  line: number,
  foldingRanges: BlockRange[]
): BlockRange {
  let best: BlockRange | undefined;
  for (const range of foldingRanges) {
    if (range.start <= line && line <= range.end) {
      if (!best || range.start >= best.start) {
        best = range;
      }
    }
  }
  return best ?? { start: line, end: line };
}

/**
 * 隣接するブロックを見つける。
 * 1. 空行をスキップして最初の非空行を見つける
 * 2. その行がフォールディング範囲の開始行なら、その範囲全体を使う
 *    (ただし、currentBlockと重ならない場合のみ)
 * 3. それ以外は、その行だけを返す
 */
export function findAdjacentBlock(
  lines: string[],
  currentBlock: BlockRange,
  direction: "up" | "down",
  foldingRanges: BlockRange[]
): BlockRange | undefined {
  let searchLine: number;

  if (direction === "up") {
    searchLine = currentBlock.start - 1;
    while (searchLine >= 0 && lines[searchLine].trim() === "") {
      searchLine--;
    }
    if (searchLine < 0) return undefined;
  } else {
    searchLine = currentBlock.end + 1;
    while (searchLine < lines.length && lines[searchLine].trim() === "") {
      searchLine++;
    }
    if (searchLine >= lines.length) return undefined;
  }

  // currentBlockが完全なブロック選択かを判定:
  // 1. 単一フォールディング範囲と一致する
  // 2. 複数ブロック選択: 先頭がフォールディング範囲の開始行、
  //    末尾がフォールディング範囲の終了行と一致する
  const effectiveStart = (() => {
    let s = currentBlock.start;
    while (s <= currentBlock.end && lines[s].trim() === "") s++;
    return s;
  })();
  const effectiveEnd = (() => {
    let e = currentBlock.end;
    while (e >= currentBlock.start && lines[e].trim() === "") e--;
    return e;
  })();

  const startsAtFold = foldingRanges.some((r) => {
    const n = normalizeFoldRange(r, lines);
    return n.start === effectiveStart;
  });
  const endsAtFold = foldingRanges.some((r) => {
    const n = normalizeFoldRange(r, lines);
    return n.end === effectiveEnd;
  });
  const isCompleteBlock = startsAtFold && endsAtFold;

  // DOWN: 常にフォールディング範囲を展開（ブロックを飛び越す）
  // UP: currentBlockが完全なブロックの場合のみ展開（ブロック同士のスワップ）
  //     それ以外はUPでは展開しない（閉じ括弧を越えてブロック内に入る挙動）
  if (direction === "down" || isCompleteBlock) {
    for (const range of foldingRanges) {
      const normalized = normalizeFoldRange(range, lines);
      const matchLine =
        direction === "down" ? normalized.start : normalized.end;
      if (matchLine === searchLine) {
        if (normalized.end < currentBlock.start || normalized.start > currentBlock.end) {
          return normalized;
        }
      }
    }
  }

  // フォールディング範囲の開始行でなければ、その行のみ
  return { start: searchLine, end: searchLine };
}

/**
 * 選択範囲がフォールディング範囲の開始行から始まっている場合、
 * その範囲全体に拡張する。部分選択でも関数全体を対象にする。
 * 選択の先頭に空行が含まれている場合は、空行をスキップして
 * フォールディング範囲の開始行と一致するか確認する。
 */
export function expandToFoldingRange(
  selection: BlockRange,
  foldingRanges: BlockRange[],
  lines: string[]
): BlockRange {
  // 選択の先頭/末尾から空行をスキップした位置を求める
  let effectiveStart = selection.start;
  while (effectiveStart <= selection.end && lines[effectiveStart].trim() === "") {
    effectiveStart++;
  }
  let effectiveEnd = selection.end;
  while (effectiveEnd >= selection.start && lines[effectiveEnd].trim() === "") {
    effectiveEnd--;
  }

  // 単一フォールディング範囲にマッチするか
  for (const range of foldingRanges) {
    const normalized = normalizeFoldRange(range, lines);
    if (normalized.start === effectiveStart && effectiveEnd <= normalized.end) {
      return normalized;
    }
  }

  // 複数ブロック選択: 先頭のフォールディング範囲と末尾のフォールディング範囲を結合
  let firstBlock: BlockRange | undefined;
  let lastBlock: BlockRange | undefined;
  for (const range of foldingRanges) {
    const normalized = normalizeFoldRange(range, lines);
    if (normalized.start === effectiveStart) {
      firstBlock = normalized;
    }
    if (normalized.end === effectiveEnd) {
      lastBlock = normalized;
    }
  }
  if (firstBlock && lastBlock) {
    return { start: firstBlock.start, end: lastBlock.end };
  }

  return selection;
}

/**
 * 2つのブロックをスワップする。
 * ブロック間のギャップ（空行など）は元の位置を維持する。
 */
export function swapBlocks(
  lines: string[],
  selection: BlockRange | null,
  cursorLine: number,
  direction: "up" | "down",
  foldingRanges: BlockRange[]
): SwapResult | undefined {
  // 現在のブロックを決定（選択範囲をフォールディング範囲に拡張）
  const raw: BlockRange = selection ?? findBlockFromFolding(cursorLine, foldingRanges);
  const currentBlock = expandToFoldingRange(raw, foldingRanges, lines);

  // 隣接ブロックを取得
  const adjacentBlock = findAdjacentBlock(lines, currentBlock, direction, foldingRanges);
  if (!adjacentBlock) return undefined;

  // upper/lower を確定
  const upper = direction === "up" ? adjacentBlock : currentBlock;
  const lower = direction === "up" ? currentBlock : adjacentBlock;

  // テキストを取得
  const upperLines = lines.slice(upper.start, upper.end + 1);
  const lowerLines = lines.slice(lower.start, lower.end + 1);
  const gapLines = lines.slice(upper.end + 1, lower.start);

  // スワップ後の行を構築
  const before = lines.slice(0, upper.start);
  const after = lines.slice(lower.end + 1);
  const newLines = [...before, ...lowerLines, ...gapLines, ...upperLines, ...after];

  // 新しい選択範囲を計算
  const currentBlockLength = currentBlock.end - currentBlock.start;
  let newStart: number;
  if (direction === "up") {
    newStart = upper.start;
  } else {
    newStart = currentBlock.start + (adjacentBlock.end - adjacentBlock.start + 1) + gapLines.length;
  }

  return {
    newLines,
    newSelection: { start: newStart, end: newStart + currentBlockLength },
  };
}
