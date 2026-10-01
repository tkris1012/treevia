import { danStyle, normalizeDan } from '../../constants/dan.js'

export default function DanBadge({ dan, style: extra }) {
  const s = danStyle(dan)
  if (!s) return null
  const big = s.tier === 4
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 1,
        minWidth: big ? 30 : 26, height: big ? 24 : 22, padding: '0 6px', boxSizing: 'border-box',
        borderRadius: 999, background: s.bg, color: s.color, border: `1.5px solid ${s.border}`,
        boxShadow: s.glow || '0 1px 3px rgba(0,0,0,0.12)',
        fontWeight: 800, lineHeight: big ? '21px' : '19px', whiteSpace: 'nowrap',
        ...extra,
      }}
    >
      <span style={{ fontSize: big ? 14 : 12 }}>{normalizeDan(dan)}</span>
      <span style={{ fontSize: 9 }}>段</span>
    </span>
  )
}
