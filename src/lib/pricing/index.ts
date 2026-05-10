/**
 * pricing/index.ts
 * 模型定价表 + 成本计算。单位：USD per million tokens。
 *
 * 设计说明：
 * - 定价表 normalize 成单一模型 → TokenPricing；匹配走 exact → prefix 两级
 * - 缓存 tokens 有独立价格（Claude），Codex 的 reasoning tokens 单独算
 * - 未知模型返回 null，不静默按 $0 算 — 上游能区分 "免费" 与 "不知道"
 *
 * 价格基准日：2026-04。若官方调价，新增 v2 表，旧 session 按记录时价格保留
 */

export interface TokenUsage {
  /** 新 input tokens（未命中缓存） */
  input: number;
  /** 输出 tokens */
  output: number;
  /** Claude 缓存命中 input（大幅折扣） */
  cacheRead?: number;
  /** Claude 缓存写入或 Codex reasoning tokens（稍贵或等同 input） */
  cacheCreate?: number;
}

export interface TokenPricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-read tokens（默认 input × 0.1） */
  cacheRead?: number;
  /** USD per 1M cache-create tokens（默认 input × 1.25） */
  cacheCreate?: number;
}

/**
 * 已知模型定价。key 是模型 ID 的 normalized 小写形式。
 * prefix 匹配：如 "claude-sonnet-4-6" 没命中 exact 会回退到 "claude-sonnet-4"
 */
const PRICING: Record<string, TokenPricing> = {
  // Claude 4.x 系列
  'claude-sonnet-4': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-haiku-4': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheCreate: 1.0 },

  // Claude 3.x legacy
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheCreate: 1.0 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheCreate: 18.75 },

  // OpenAI GPT-5 系列（2026 价格，cacheRead 即 cached_input_tokens 折扣）
  'gpt-5': { input: 1.25, output: 10.0, cacheRead: 0.125 },
  'gpt-5-mini': { input: 0.25, output: 2.0, cacheRead: 0.025 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.005 },

  // 老的 gpt-4 class fallback
  'gpt-4o': { input: 2.5, output: 10.0, cacheRead: 1.25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075 },
};

/**
 * 找到匹配的定价。两级 prefix 回退：
 * 1. 按 "-" 剥尾（claude-sonnet-4-6 → claude-sonnet-4 → claude-sonnet）
 * 2. 每一轮里若最后一段含 "."，再试剥掉 "." 后的子版本（gpt-5.4 → gpt-5）
 *
 * 这样 OpenAI 风格的点号小版本 (gpt-5.4, gpt-5.1-nano) 能自动回退到 gpt-5 定价
 */
export function getPricing(model: string | null | undefined): TokenPricing | null {
  if (!model) return null;
  const key = model.toLowerCase();
  if (PRICING[key]) return PRICING[key];

  const parts = key.split('-');
  while (parts.length > 0) {
    // 若最后一段含 "."，先试剥 "." 后的子版本
    const last = parts[parts.length - 1];
    const dotIdx = last.indexOf('.');
    if (dotIdx > 0) {
      const truncated = [...parts.slice(0, -1), last.slice(0, dotIdx)].join('-');
      if (PRICING[truncated]) return PRICING[truncated];
    }
    parts.pop();
    if (parts.length === 0) break;
    const candidate = parts.join('-');
    if (PRICING[candidate]) return PRICING[candidate];
  }

  return null;
}

/**
 * 计算一次使用的 USD 成本。未知模型返回 null（上游决定显示 "—" 还是回退其他策略）。
 */
export function calculateCost(
  model: string | null | undefined,
  usage: TokenUsage,
): number | null {
  const pricing = getPricing(model);
  if (!pricing) return null;

  const perMillion = 1_000_000;
  const cacheReadRate = pricing.cacheRead ?? pricing.input * 0.1;
  const cacheCreateRate = pricing.cacheCreate ?? pricing.input * 1.25;

  const cost =
    (usage.input * pricing.input) / perMillion +
    (usage.output * pricing.output) / perMillion +
    ((usage.cacheRead ?? 0) * cacheReadRate) / perMillion +
    ((usage.cacheCreate ?? 0) * cacheCreateRate) / perMillion;

  return cost;
}

/**
 * 格式化美元显示。统一两位小数；极小值用更高精度避免 "$0.00"。
 */
export function formatCostUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
