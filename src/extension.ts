import * as vscode from "vscode";
import { swapBlocks, type BlockRange } from "./core.js";

async function getFoldingRanges(
  document: vscode.TextDocument
): Promise<BlockRange[]> {
  const ranges: vscode.FoldingRange[] | undefined =
    await vscode.commands.executeCommand(
      "vscode.executeFoldingRangeProvider",
      document.uri
    );

  if (!ranges) return [];
  return ranges.map((r) => ({ start: r.start, end: r.end }));
}

async function executeSwap(
  editor: vscode.TextEditor,
  direction: "up" | "down"
): Promise<void> {
  const document = editor.document;
  const selection = editor.selection;

  // ドキュメントの全行を取得
  const lines: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    lines.push(document.lineAt(i).text);
  }

  // 選択範囲をBlockRangeに変換
  let selectionRange: BlockRange | null = null;
  if (!selection.isEmpty) {
    let endLine = selection.end.line;
    if (selection.end.character === 0 && endLine > selection.start.line) {
      endLine--;
    }
    selectionRange = { start: selection.start.line, end: endLine };
  }

  const foldingRanges = await getFoldingRanges(document);
  const result = swapBlocks(
    lines,
    selectionRange,
    selection.active.line,
    direction,
    foldingRanges
  );

  if (!result) return;

  // テキスト全体を置換
  const fullRange = new vscode.Range(
    0,
    0,
    document.lineCount - 1,
    document.lineAt(document.lineCount - 1).text.length
  );
  const newText = result.newLines.join("\n");

  await editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, newText);
  });

  // 選択範囲/カーソルを更新
  const newStart = new vscode.Position(result.newSelection.start, 0);
  const newEnd = new vscode.Position(
    result.newSelection.end,
    document.lineAt(Math.min(result.newSelection.end, document.lineCount - 1))
      .text.length
  );

  if (selectionRange) {
    editor.selection = new vscode.Selection(newStart, newEnd);
  } else {
    const col = Math.min(
      selection.active.character,
      document.lineAt(result.newSelection.start).text.length
    );
    const pos = new vscode.Position(result.newSelection.start, col);
    editor.selection = new vscode.Selection(pos, pos);
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("swapBlocks.moveUp", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) executeSwap(editor, "up");
    }),
    vscode.commands.registerCommand("swapBlocks.moveDown", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) executeSwap(editor, "down");
    })
  );
}

export function deactivate() {}
