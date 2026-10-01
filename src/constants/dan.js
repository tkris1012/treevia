export const DAN_MAX = 20
export const DAN_OPTIONS = Array.from({ length: DAN_MAX }, (_, i) => i + 1)

export function normalizeDan(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= DAN_MAX ? n : null
}

// 段数が上がるほど目立たせる（1〜3 / 4〜6 / 7〜10 / 11〜20）
export function danStyle(v) {
  const dan = normalizeDan(v)
  if (!dan) return null
  if (dan <= 3)  return { tier: 1, bg: '#F3F4F6', color: '#4B5563', border: '#D1D5DB' }
  if (dan <= 6)  return { tier: 2, bg: '#DBEAFE', color: '#1D4ED8', border: '#93C5FD' }
  if (dan <= 10) return { tier: 3, bg: '#F59E0B', color: '#FFFFFF', border: '#D97706' }
  return {
    tier: 4,
    bg: 'linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)',
    color: '#FFFFFF',
    border: '#9F1239',
    glow: '0 0 0 3px rgba(244,63,94,0.25), 0 2px 6px rgba(190,18,60,0.45)',
  }
}
