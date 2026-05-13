const WORKTREE_MARKERS = ['/.claude/worktrees/', '/.codex/worktrees/'];

export function normalizeProjectPath(projectPath: string): string {
  for (const marker of WORKTREE_MARKERS) {
    const index = projectPath.indexOf(marker);
    if (index >= 0) return projectPath.slice(0, index);
  }
  return projectPath;
}
