/**
 * stage-inferrer.ts
 * 根据 git branch 名 + session summary 关键词 + 活跃度推断 project/track stage
 *
 * 核心逻辑：
 * - 真正的 feature branch（feat/xxx, fix/xxx 等）直接映射
 * - main/master/HEAD 这些非特征分支，完全靠 summary 关键词判断
 * - 有 lastActive 参数时，超过 14 天不活跃 → done（项目休眠）
 */

type Stage = 'think' | 'review' | 'build' | 'test' | 'done';

export function inferStage(
  gitBranch: string | null,
  summary: string,
  lastActive?: number | null,
): Stage {
  const branch = (gitBranch ?? '').toLowerCase().trim();
  const sum = summary.toLowerCase();

  // 如果项目超过 14 天没活跃，标记为 done（休眠）
  if (lastActive) {
    const daysSinceActive = (Date.now() - lastActive) / 86_400_000;
    if (daysSinceActive > 14) return 'done';
  }

  // 特征分支 — 明确语义，优先级最高
  if (/^(feat|feature|build)\//.test(branch)) return 'build';
  if (/^(fix|hotfix|bugfix|patch)\//.test(branch)) return 'test';
  if (/^(review|pr|code-review)\//.test(branch)) return 'review';
  if (/^(plan|spec|design|think|spike|rfc)\//.test(branch)) return 'think';
  if (/^(test|tests|testing)\//.test(branch)) return 'test';
  if (/^release\//.test(branch)) return 'done';

  // main/master/HEAD/空 — 靠 summary 关键词判断
  // 这是大多数情况（用户直接在主分支上工作）
  if (/\b(deploy|release|ship|launch|publish|complet|finish|done)\b/.test(sum)) return 'done';
  if (/\b(code review|reviewing|reviewed|pr |pull request)\b/.test(sum)) return 'review';
  if (/\b(test|testing|tests|pytest|jest|vitest|coverage|spec)\b/.test(sum)) return 'test';
  if (/\b(planning|plan|spec|design|wireframe|architecture|think|brainstorm|rfc)\b/.test(sum)) return 'think';
  if (/\b(build|implement|feature|add|creat|refactor|fix|debug|bug|update|migration|setup)\b/.test(sum)) return 'build';

  // 如果连 summary 都没有或匹配不到，看活跃度
  if (lastActive) {
    const daysSinceActive = (Date.now() - lastActive) / 86_400_000;
    if (daysSinceActive > 7) return 'done';
    if (daysSinceActive > 3) return 'review';
  }

  return 'build'; // 最安全的默认值
}
