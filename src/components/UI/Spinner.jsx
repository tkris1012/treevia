// 読み込み中の回転マーク
const KEYFRAMES = '@keyframes treevia-spin { to { transform: rotate(360deg) } }'

export default function Spinner({ size = 32, label, color = '#15A24A', style }) {
  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, ...style,
    }}>
      <style>{KEYFRAMES}</style>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        border: `${Math.max(3, Math.round(size / 9))}px solid rgba(21,162,74,0.18)`,
        borderTopColor: color,
        animation: 'treevia-spin 0.8s linear infinite',
      }} />
      {label && <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{label}</div>}
    </div>
  )
}
