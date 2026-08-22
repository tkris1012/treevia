import { Check, X } from 'lucide-react'
import { NODE_W, NODE_H } from './useTreeLayout.js'

export default function DropZone({ x, y, isOver, isValid }) {
  const color = !isValid ? '#EF4444' : isOver ? '#10B981' : '#6EE7B7'
  const opacity = isOver ? 0.9 : 0.6

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={isOver ? (isValid ? '#D1FAE5' : '#FEE2E2') : 'transparent'}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="6 4"
        opacity={opacity}
        style={{ pointerEvents: 'none' }}
      />
      {isOver && (
        isValid
          ? <Check x={x + NODE_W / 2 - 12} y={y + NODE_H / 2 - 12} width={24} height={24}
              color="#059669" strokeWidth={2.5} style={{ pointerEvents: 'none' }} />
          : <X x={x + NODE_W / 2 - 12} y={y + NODE_H / 2 - 12} width={24} height={24}
              color="#DC2626" strokeWidth={2.5} style={{ pointerEvents: 'none' }} />
      )}
    </g>
  )
}
