// P9 — 从 JSONL session 抽 Edit/Write/apply_patch，供归因引擎消费
// 纯解析模块：无 DB 副作用、无 git 调用，便于独立测试和缓存
// Schema-drift-tolerant：未知字段跳过；不完整条目 warn-log 并排除

import { createReadStream } from 'fs';
import { createInterface } from 'readline';

// 一条 Edit/Write/Patch 的归一化表示。
// range 由 engine 后续再与 git blame 的行号对齐；这里只给 estimatedLines 做粗匹配
export interface ToolCallEdit {
  sessionId: string; // 调用方传入（从文件名解析）
  timestamp: number; // ms
  tool: 'Edit' | 'Write' | 'MultiEdit' | 'apply_patch';
  filePath: string; // 绝对或相对路径，保持原样
  newText: string; // Edit.new_string / Write.content / patch 里 + 行 concat
  oldText: string | null; // Edit.old_string；Write 为 null；patch 里 - 行 concat
  estimatedLines: number; // newText.split('\n').length
}

const CLAUDE_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

// 把 ISO 时间戳安全转 ms；失败返回 null
function parseTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function countLines(text: string): number {
  if (!text) return 0;
  // split('\n') 对空字符串给 [''] 长度 1，上面已兜底
  return text.split('\n').length;
}

/**
 * 流式解析 Claude JSONL session 文件，抽出 Edit / Write / MultiEdit 的 tool_use。
 * - Edit → 1 条
 * - Write → 1 条（oldText = null）
 * - MultiEdit → 展开成 N 条（共享 filePath + timestamp）
 * 不完整条目（缺 filePath / newText）warn 后跳过，不入列表。
 */
export async function extractClaudeEdits(
  filePath: string,
  sessionId: string,
): Promise<ToolCallEdit[]> {
  const edits: ToolCallEdit[] = [];

  await new Promise<void>((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        // schema drift: 非 JSON 行跳过
        return;
      }

      if (!isRecord(obj)) return;
      if (obj.type !== 'assistant') return;

      const message = obj.message;
      if (!isRecord(message)) return;
      const content = message.content;
      if (!Array.isArray(content)) return;

      const ts = parseTimestamp(obj.timestamp);

      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block.type !== 'tool_use') continue;
        const name = block.name;
        if (typeof name !== 'string' || !CLAUDE_EDIT_TOOLS.has(name)) continue;

        const input = block.input;
        if (!isRecord(input)) {
          console.warn(
            `[tool-call-parser] claude ${sessionId}: ${name} missing input, skip`,
          );
          continue;
        }

        if (ts === null) {
          console.warn(
            `[tool-call-parser] claude ${sessionId}: ${name} missing timestamp, skip`,
          );
          continue;
        }

        if (name === 'Edit') {
          pushEdit(edits, buildClaudeEdit(sessionId, ts, 'Edit', input));
        } else if (name === 'Write') {
          pushEdit(edits, buildClaudeWrite(sessionId, ts, input));
        } else if (name === 'MultiEdit') {
          const filePathRaw = input.file_path;
          if (typeof filePathRaw !== 'string' || !filePathRaw) {
            console.warn(
              `[tool-call-parser] claude ${sessionId}: MultiEdit missing file_path, skip`,
            );
            continue;
          }
          const subEdits = input.edits;
          if (!Array.isArray(subEdits)) {
            console.warn(
              `[tool-call-parser] claude ${sessionId}: MultiEdit.edits not array, skip`,
            );
            continue;
          }
          for (const sub of subEdits) {
            if (!isRecord(sub)) continue;
            const oldText = typeof sub.old_string === 'string' ? sub.old_string : '';
            const newText = typeof sub.new_string === 'string' ? sub.new_string : '';
            if (!newText) continue; // 空 new_string 通常是纯删除（MultiEdit 不追踪删除）
            edits.push({
              sessionId,
              timestamp: ts,
              tool: 'MultiEdit',
              filePath: filePathRaw,
              newText,
              oldText: oldText || null,
              estimatedLines: countLines(newText),
            });
          }
        }
      }
    });

    rl.on('close', () => resolve());
    rl.on('error', () => resolve());
  });

  return edits;
}

function buildClaudeEdit(
  sessionId: string,
  ts: number,
  tool: 'Edit',
  input: Record<string, unknown>,
): ToolCallEdit | null {
  const filePathRaw = input.file_path;
  const newText = typeof input.new_string === 'string' ? input.new_string : '';
  const oldText = typeof input.old_string === 'string' ? input.old_string : '';
  if (typeof filePathRaw !== 'string' || !filePathRaw) {
    console.warn(
      `[tool-call-parser] claude ${sessionId}: Edit missing file_path, skip`,
    );
    return null;
  }
  if (!newText) return null; // 纯删除不追踪
  return {
    sessionId,
    timestamp: ts,
    tool,
    filePath: filePathRaw,
    newText,
    oldText: oldText || null,
    estimatedLines: countLines(newText),
  };
}

function buildClaudeWrite(
  sessionId: string,
  ts: number,
  input: Record<string, unknown>,
): ToolCallEdit | null {
  const filePathRaw = input.file_path;
  const content = typeof input.content === 'string' ? input.content : '';
  if (typeof filePathRaw !== 'string' || !filePathRaw) {
    console.warn(
      `[tool-call-parser] claude ${sessionId}: Write missing file_path, skip`,
    );
    return null;
  }
  if (!content) {
    console.warn(
      `[tool-call-parser] claude ${sessionId}: Write empty content on ${filePathRaw}, skip`,
    );
    return null;
  }
  return {
    sessionId,
    timestamp: ts,
    tool: 'Write',
    filePath: filePathRaw,
    newText: content,
    oldText: null,
    estimatedLines: countLines(content),
  };
}

function pushEdit(arr: ToolCallEdit[], edit: ToolCallEdit | null): void {
  if (edit) arr.push(edit);
}

/**
 * 流式解析 Codex rollout JSONL，抽出 apply_patch 的文件修改。
 * - Update File / Add File → ToolCallEdit（每个 hunk 一条）
 * - Delete File → 跳过（Area 1 决策：删除代码不追踪）
 * - shell 命令（sed/cat > file）不处理 — 语义模糊，易误归因
 */
export async function extractCodexEdits(
  filePath: string,
  sessionId: string,
): Promise<ToolCallEdit[]> {
  const edits: ToolCallEdit[] = [];

  await new Promise<void>((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        return;
      }

      if (!isRecord(obj)) return;
      if (obj.type !== 'response_item') return;
      const payload = obj.payload;
      if (!isRecord(payload)) return;
      if (payload.type !== 'function_call') return;
      if (payload.name !== 'apply_patch') return;

      const ts = parseTimestamp(obj.timestamp);
      if (ts === null) {
        console.warn(
          `[tool-call-parser] codex ${sessionId}: apply_patch missing timestamp, skip`,
        );
        return;
      }

      const argsRaw = payload.arguments;
      if (typeof argsRaw !== 'string' || !argsRaw) {
        console.warn(
          `[tool-call-parser] codex ${sessionId}: apply_patch missing arguments, skip`,
        );
        return;
      }

      let patchText: string | null = null;
      try {
        const parsed = JSON.parse(argsRaw);
        if (isRecord(parsed) && typeof parsed.input === 'string') {
          patchText = parsed.input;
        }
      } catch {
        // arguments 不是 JSON：整段当 raw patch 试试
        patchText = argsRaw;
      }

      if (!patchText) {
        console.warn(
          `[tool-call-parser] codex ${sessionId}: apply_patch no patch text, skip`,
        );
        return;
      }

      const hunks = parseUnifiedPatch(patchText);
      if (hunks.length === 0) {
        console.warn(
          `[tool-call-parser] codex ${sessionId}: apply_patch produced 0 hunks (unparseable?)`,
        );
        return;
      }

      for (const h of hunks) {
        if (!h.newLines) continue; // 纯删除 hunk 跳过（Area 1：不追踪删除）
        edits.push({
          sessionId,
          timestamp: ts,
          tool: 'apply_patch',
          filePath: h.file,
          newText: h.newLines,
          oldText: h.oldLines || null,
          estimatedLines: countLines(h.newLines),
        });
      }
    });

    rl.on('close', () => resolve());
    rl.on('error', () => resolve());
  });

  return edits;
}

interface PatchHunk {
  file: string;
  op: 'update' | 'add';
  oldLines: string;
  newLines: string;
}

/**
 * 手写 Codex apply_patch 格式解析器（不引入第三方 diff 库）。
 *
 * 支持两种 envelope：
 * 1. Codex 官方格式（首选）：
 *    *** Begin Patch
 *    *** Update File: <path>   |   *** Add File: <path>   |   *** Delete File: <path>
 *    @@
 *    -old
 *    +new
 *    *** End Patch
 *
 * 2. Fallback: 没有 `*** Begin Patch` 标记时，尝试把整段当 raw unified diff 解析
 *    （要求文件头行 `*** Update File: xxx` 或 `+++ b/xxx` 出现）。
 *
 * 每个 hunk（遇到新 `***` 文件头或 EOF 时 flush）产出一条 PatchHunk。
 */
export function parseUnifiedPatch(patchText: string): PatchHunk[] {
  const lines = patchText.split('\n');
  const hunks: PatchHunk[] = [];

  let currentFile: string | null = null;
  let currentOp: 'update' | 'add' | 'delete' | null = null;
  let bufOld: string[] = [];
  let bufNew: string[] = [];
  let inHunk = false;

  const flush = () => {
    if (!currentFile || currentOp === 'delete') {
      bufOld = [];
      bufNew = [];
      inHunk = false;
      return;
    }
    if (currentOp === null) {
      bufOld = [];
      bufNew = [];
      inHunk = false;
      return;
    }
    // 只有真的收到过 +/- 行才产 hunk
    if (bufOld.length === 0 && bufNew.length === 0) {
      inHunk = false;
      return;
    }
    hunks.push({
      file: currentFile,
      op: currentOp,
      oldLines: bufOld.join('\n'),
      newLines: bufNew.join('\n'),
    });
    bufOld = [];
    bufNew = [];
    inHunk = false;
  };

  for (const raw of lines) {
    // Codex envelope 标记
    if (raw.startsWith('*** Begin Patch') || raw.startsWith('*** End Patch')) {
      flush();
      continue;
    }

    // File 头切换：先 flush 之前积累的 hunk
    const updateMatch = raw.match(/^\*\*\* Update File:\s*(.+)$/);
    const addMatch = raw.match(/^\*\*\* Add File:\s*(.+)$/);
    const deleteMatch = raw.match(/^\*\*\* Delete File:\s*(.+)$/);

    if (updateMatch) {
      flush();
      currentFile = updateMatch[1].trim();
      currentOp = 'update';
      continue;
    }
    if (addMatch) {
      flush();
      currentFile = addMatch[1].trim();
      currentOp = 'add';
      continue;
    }
    if (deleteMatch) {
      flush();
      currentFile = deleteMatch[1].trim();
      currentOp = 'delete'; // 后续 +/- 行会在 flush 时被丢弃
      continue;
    }

    // Fallback: raw unified diff header `+++ b/path`
    const plusHeader = raw.match(/^\+\+\+\s+b\/(.+)$/);
    if (plusHeader && !currentFile) {
      flush();
      currentFile = plusHeader[1].trim();
      currentOp = 'update';
      continue;
    }
    // `--- a/path` 也先吞掉，不作为内容
    if (raw.startsWith('--- a/') || raw.startsWith('--- /dev/null')) continue;

    // hunk 起始
    if (raw.startsWith('@@')) {
      // 新 hunk 前 flush 之前的
      if (inHunk && currentFile) {
        hunks.push({
          file: currentFile,
          op: currentOp === 'add' ? 'add' : 'update',
          oldLines: bufOld.join('\n'),
          newLines: bufNew.join('\n'),
        });
        bufOld = [];
        bufNew = [];
      }
      inHunk = true;
      continue;
    }

    if (!currentFile) continue; // 还没看到文件头，忽略 preamble

    // +/- 行是内容；空格开头是 context（两侧都有，但我们只追踪改动所以忽略 context）
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      inHunk = true;
      bufNew.push(raw.slice(1));
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      inHunk = true;
      bufOld.push(raw.slice(1));
    }
    // 其它（context / 空行）不入 buf
  }

  // 文件结束前再 flush 一次
  flush();

  // op='delete' 的已在 flush 时丢弃；这里剩的都是 update/add
  return hunks;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
