import { Eye } from 'lucide-react'

export default function ViewModeBanner() {
  return (
    <div
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8,
        background: 'rgba(31, 41, 55, 0.85)', color: 'white',
        fontSize: 12, fontWeight: 600,
        boxShadow: '0 2px 8px rgba(0,0,0,0.20)',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}
    >
<Eye size={14} /> 閲覧モード
    </div>
  )
}
