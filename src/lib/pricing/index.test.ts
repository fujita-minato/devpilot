import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCost, getPricing, formatCostUsd } from './index.ts';

test('getPricing exact match', () => {
  const p = getPricing('claude-sonnet-4');
  assert.equal(p?.input, 3.0);
  assert.equal(p?.output, 15.0);
});

test('getPricing prefix fallback', () => {
  // claude-sonnet-4-6 不在表里，应回退到 claude-sonnet-4
  const p = getPricing('claude-sonnet-4-6');
  assert.equal(p?.input, 3.0);
});

test('getPricing deep prefix fallback', () => {
  // gpt-5-mini-2026-x 应回退到 gpt-5-mini
  const p = getPricing('gpt-5-mini-2026-x');
  assert.equal(p?.input, 0.25);
});

test('getPricing dotted subversion fallback (OpenAI style)', () => {
  // Codex rollouts 写 "gpt-5.4" —— 应回退到 gpt-5
  assert.equal(getPricing('gpt-5.4')?.input, 1.25);
  assert.equal(getPricing('gpt-5.1')?.input, 1.25);
  assert.equal(getPricing('gpt-5-mini.2')?.input, 0.25);
});

test('getPricing unknown returns null', () => {
  assert.equal(getPricing('totally-unknown-model'), null);
  assert.equal(getPricing(null), null);
  assert.equal(getPricing(undefined), null);
  assert.equal(getPricing(''), null);
});

test('getPricing is case-insensitive', () => {
  assert.equal(getPricing('CLAUDE-SONNET-4')?.input, 3.0);
});

test('calculateCost basic Claude Sonnet', () => {
  // 1M input × $3 + 1M output × $15 = $18
  const cost = calculateCost('claude-sonnet-4', {
    input: 1_000_000,
    output: 1_000_000,
  });
  assert.equal(cost, 18);
});

test('calculateCost with cache tokens', () => {
  // claude-sonnet-4: input $3, output $15, cacheRead $0.3, cacheCreate $3.75
  // 100k input = $0.30, 100k output = $1.50, 100k cacheRead = $0.03, 100k cacheCreate = $0.375
  const cost = calculateCost('claude-sonnet-4', {
    input: 100_000,
    output: 100_000,
    cacheRead: 100_000,
    cacheCreate: 100_000,
  });
  assert.ok(cost !== null);
  assert.equal(cost!.toFixed(4), '2.2050');
});

test('calculateCost returns null for unknown model', () => {
  const cost = calculateCost('mystery-model', { input: 1000, output: 1000 });
  assert.equal(cost, null);
});

test('calculateCost cache defaults apply when only input rate given', () => {
  // 自定义模型不走 — 这里只用 gpt-4o 验证 cacheRead 实际值
  // gpt-4o: input $2.5, output $10, cacheRead $1.25
  // 1M cacheRead = $1.25
  const cost = calculateCost('gpt-4o', {
    input: 0,
    output: 0,
    cacheRead: 1_000_000,
  });
  assert.equal(cost, 1.25);
});

test('formatCostUsd tiers', () => {
  assert.equal(formatCostUsd(null), '—');
  assert.equal(formatCostUsd(0), '$0.00');
  assert.equal(formatCostUsd(0.00123), '$0.0012');
  assert.equal(formatCostUsd(0.523), '$0.523');
  assert.equal(formatCostUsd(12.345), '$12.35');
});
