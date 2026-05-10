// devpilot observatory — design tokens
// Aligned with Claude Code CLI's visual language:
//   - warm near-black surfaces (no blue tint)
//   - cream text (no blue-white)
//   - single brand accent: Claude red-orange
//   - no radial glows / gradient washes / heavy elevation
//   - hierarchy via typography weight + size, not color
//
// Rules:
//   brand === claude (devpilot lives in the Claude ecosystem)
//   codex gets a clearly secondary cool steel
//   semantic colors (success / warn / danger) used only for state, not decoration

export const tokens = {
  // surfaces — 3 levels, warm black
  bg: '#0b0b0d',
  surface: '#141416',
  raised: '#1d1d20',
  overlay: 'rgba(11,11,13,0.78)',

  // borders + dividers
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  divider: 'rgba(255,255,255,0.05)',

  // text ladder — warm cream
  text: '#ede9e1',
  textDim: '#b8b4ac',
  muted: '#7c7974',
  dim: '#52504c',
  faint: '#2d2c2a',

  // brand + Claude runner (same hue)
  brand: '#d97757',
  brandSoft: 'rgba(217,119,87,0.10)',
  brandHi: 'rgba(217,119,87,0.22)',
  claude: '#d97757',
  claudeSoft: 'rgba(217,119,87,0.10)',
  claudeHi: 'rgba(217,119,87,0.22)',

  // codex runner — cool steel, clearly secondary
  codex: '#8fa5c4',
  codexSoft: 'rgba(143,165,196,0.10)',
  codexHi: 'rgba(143,165,196,0.22)',

  // semantic — used sparingly, only for state
  success: '#7aa889',
  successSoft: 'rgba(122,168,137,0.10)',
  warn: '#c8985f',
  warnSoft: 'rgba(200,152,95,0.10)',
  danger: '#c76b6f',
  dangerSoft: 'rgba(199,107,111,0.10)',

  // elevation — barely there
  shadow1: '0 1px 0 rgba(0,0,0,0.40)',
  shadow2: '0 2px 8px rgba(0,0,0,0.50)',
  shadow3: '0 24px 48px rgba(0,0,0,0.65)',

  focus: '#d97757',
} as const;

export type ObservatoryTokens = typeof tokens;
