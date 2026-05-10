// P9 - simple-git wrapper supplying per-line blame + file history

/**
 * authorship/git-blame.ts
 *
 * 封装 simple-git 的 blame / log --follow / check-ignore 能力。
 * 全部通过 simple-git 官方 API（本身使用 execFile-style spawn，非 shell exec），
 * 不拼接 shell 命令，避免任何 command injection 风险。
 *
 * 设计要点：
 *   - 纯读取，零副作用，不写 DB
 *   - 异常不向上抛：文件不在 repo / 不存在 / 不可 blame 时返回 null 或 []，打 warn
 *   - blame 用 --porcelain 机读格式；同一 commit 仅首次出现时带 header，后续复用需要缓存
 *   - check-ignore 反语义：非零退出（reject）= 未被 ignore（git 命令惯例）
 *   - binary 判定：读前 8KB，若含 NUL 字节即判二进制（git 内部类似启发式）
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';

export interface BlameLine {
  /** 1-based 行号，对齐 HEAD 当前该文件的行号 */
  lineNumber: number;
  /** 40-char git object SHA */
  commitSha: string;
  /** author-time 转毫秒（git %at 原单位秒） */
  authoredAt: number;
  authorName: string;
  authorEmail: string;
  /** 行文本内容（不含末尾换行） */
  content: string;
}

export interface FileHistoryEntry {
  commitSha: string;
  /** author-time ms */
  authoredAt: number;
  authorName: string;
  authorEmail: string;
}

/** blame porcelain 输出里缓存的 commit 元数据 */
interface CommitMeta {
  authorName: string;
  authorEmail: string;
  /** seconds（git 原始单位） */
  authorTimeSec: number;
}

function gitFor(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

/**
 * 解析 `git blame --porcelain` 输出。
 *
 * Porcelain 结构（每行原文前缀为 tab）：
 *   <sha> <orig-line> <final-line> [<count>]   # count 只在该 hunk 首行出现
 *   author <name>                              # 仅在该 sha 首次出现时给
 *   author-mail <<email>>
 *   author-time <unix-seconds>
 *   author-tz <tz>
 *   committer ...                              # 忽略
 *   summary ...                                # 忽略
 *   filename ...                               # 忽略
 *   \t<行原文>
 *
 * 同一 sha 再次出现时只给 header 行 `<sha> <orig> <final>`，不再重复 author/time；
 * 所以必须缓存 sha → CommitMeta。
 */
function parsePorcelain(raw: string): BlameLine[] {
  const lines = raw.split('\n');
  const metaBySha = new Map<string, CommitMeta>();
  const result: BlameLine[] = [];

  let i = 0;
  let currentSha = '';
  let currentFinalLine = 0;
  let pendingMeta: Partial<CommitMeta> = {};

  while (i < lines.length) {
    const line = lines[i];
    // header: <sha-hex-40> <orig> <final> [<count>]
    const header = /^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/.exec(line);
    if (header) {
      currentSha = header[1];
      currentFinalLine = parseInt(header[3], 10);
      pendingMeta = {};
      i++;
      // 后续是 key-value header 行，直到遇到 tab-prefixed 内容行
      while (i < lines.length && !lines[i].startsWith('\t')) {
        const kv = lines[i];
        if (kv.startsWith('author ')) {
          pendingMeta.authorName = kv.slice('author '.length);
        } else if (kv.startsWith('author-mail ')) {
          // 原格式: "author-mail <email@x>"
          const mail = kv.slice('author-mail '.length).trim();
          pendingMeta.authorEmail = mail.replace(/^<|>$/g, '');
        } else if (kv.startsWith('author-time ')) {
          pendingMeta.authorTimeSec = parseInt(kv.slice('author-time '.length), 10);
        }
        // 其他 (committer / summary / filename / previous / boundary) 忽略
        i++;
      }
      // pendingMeta 完整则入缓存；否则用已缓存（同 sha 再次出现时无 header）
      if (
        pendingMeta.authorName !== undefined &&
        pendingMeta.authorEmail !== undefined &&
        pendingMeta.authorTimeSec !== undefined
      ) {
        metaBySha.set(currentSha, pendingMeta as CommitMeta);
      }
      // 接下来应是 tab 开头的内容行
      if (i < lines.length && lines[i].startsWith('\t')) {
        const content = lines[i].slice(1);
        const meta = metaBySha.get(currentSha);
        if (meta) {
          result.push({
            lineNumber: currentFinalLine,
            commitSha: currentSha,
            authoredAt: meta.authorTimeSec * 1000,
            authorName: meta.authorName,
            authorEmail: meta.authorEmail,
            content,
          });
        }
        i++;
      }
      continue;
    }
    // 非 header 也非已消费内容 —— 跳过（空行等）
    i++;
  }

  result.sort((a, b) => a.lineNumber - b.lineNumber);
  return result;
}

/**
 * 对 repoPath 里 relPath 的文件跑 `git blame HEAD`。
 * 不可 blame（文件不在 repo / 不在 HEAD / 出错）→ 返回 null。
 */
export async function blameFile(
  repoPath: string,
  relPath: string,
): Promise<BlameLine[] | null> {
  try {
    const raw = await gitFor(repoPath).raw([
      'blame',
      '--porcelain',
      'HEAD',
      '--',
      relPath,
    ]);
    if (!raw) return null;
    const parsed = parsePorcelain(raw);
    return parsed.length > 0 ? parsed : null;
  } catch (err) {
    console.warn(
      `[authorship] blameFile failed for ${relPath} in ${repoPath}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * `git log --follow` 拿文件历史（跨 rename）。失败返回 []。
 */
export async function fileHistory(
  repoPath: string,
  relPath: string,
): Promise<FileHistoryEntry[]> {
  try {
    const raw = await gitFor(repoPath).raw([
      'log',
      '--follow',
      '--format=%H|%at|%an|%ae',
      '--',
      relPath,
    ]);
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [sha, at, name, email] = line.split('|');
        return {
          commitSha: sha,
          authoredAt: parseInt(at, 10) * 1000,
          authorName: name ?? '',
          authorEmail: email ?? '',
        } satisfies FileHistoryEntry;
      })
      .filter((entry) => entry.commitSha.length === 40);
  } catch (err) {
    console.warn(
      `[authorship] fileHistory failed for ${relPath} in ${repoPath}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * 判断某相对路径是否可被 authorship 归因：
 *   - 不被 .gitignore 忽略
 *   - 被 git tracked
 *   - 非二进制（前 8KB 不含 NUL 字节）
 *
 * 注意 git 命令语义反转：
 *   check-ignore 找到匹配 → 退出码 0（被 ignore）
 *   check-ignore 未匹配 → 退出码 1（simple-git 会 reject）
 * 把 reject 翻译为 "未 ignore"，继续；resolve 翻译为 "被 ignore"，返回 false。
 */
export async function isTrackedTextFile(
  repoPath: string,
  relPath: string,
): Promise<boolean> {
  const git = gitFor(repoPath);

  // 1) check-ignore — resolve 且有输出 = 被 ignore; reject = 未 ignore
  try {
    const out = await git.raw(['check-ignore', '--', relPath]);
    if (out && out.trim().length > 0) return false;
  } catch {
    // reject = 未 ignore，继续
  }

  // 2) ls-files --error-unmatch — resolve = tracked; reject = 未 tracked
  try {
    await git.raw(['ls-files', '--error-unmatch', '--', relPath]);
  } catch {
    return false;
  }

  // 3) 二进制启发式：读前 8KB 找 NUL
  try {
    const abs = path.resolve(repoPath, relPath);
    const fh = await fs.open(abs, 'r');
    try {
      const buf = Buffer.alloc(8192);
      const { bytesRead } = await fh.read(buf, 0, 8192, 0);
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0) return false;
      }
    } finally {
      await fh.close();
    }
  } catch (err) {
    // 文件打不开（权限 / 被删 / 是目录）→ 不归因
    console.warn(
      `[authorship] isTrackedTextFile read failed for ${relPath}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  return true;
}

/**
 * 列出 HEAD 所有被追踪文件（相对 repo root）。Wave 2 engine 枚举用。
 */
export async function listTrackedFiles(repoPath: string): Promise<string[]> {
  try {
    const raw = await gitFor(repoPath).raw(['ls-files']);
    if (!raw) return [];
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch (err) {
    console.warn(
      `[authorship] listTrackedFiles failed in ${repoPath}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
