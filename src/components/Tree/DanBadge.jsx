import { danStyle, normalizeDan } from '../../constants/dan.js'

export default function DanBadge({ dan, style: extra }) {
  const s = danStyle(dan)
  if (!s) return null
  const big = s.tier === 4
  const size = big ? 26 : 22
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: size, height: size, padding: '0 5px', boxSizing: 'border-box',
        borderRadius: 999, background: s.bg, color: s.color, border: `1.5px solid ${s.border}`,
        boxShadow: s.glow || '0 1px 3px rgba(0,0,0,0.12)',
        fontSize: big ? 14 : 12, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
        ...extra,
      }}
    >
      {normalizeDan(dan)}
    </span>
  )
}
