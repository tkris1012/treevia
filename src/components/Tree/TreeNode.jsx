import { getRoleStyle, roleName } from '../../constants/roles.js'
import { useStore } from '../../store/useStore.js'
import { NODE_W, NODE_H } from './useTreeLayout.js'

export default function TreeNode({ member, isRoot, isDragging }) {
  const roles = useStore((s) => s.roles)
  if (!member) return null
  const style = getRoleStyle(member.role, roles)
  const roleLabel = roleName(member.role, roles)
  const hasRole = !!roleLabel
  const hasJob  = !!member.job

  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: 10,
        border: `2px solid ${style.border}`,
        background: style.fill,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        boxSizing: 'border-box',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        userSelect: 'none',
        overflow: 'visible',
        pointerEvents: 'none', // SVGのoverlay rectにイベントを委譲
      }}
    >
      {/* ROOT badge */}
      {isRoot && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            left: NODE_W / 2 - 22,
            fontSize: 8,
            fontWeight: 700,
            background: style.sub,
            color: 'white',
            padding: '1px 5px',
            borderRadius: 4,
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}
        >
          ROOT
        </span>
      )}

      {/* Photo */}
      <div
        style={{
          width: 68,
          height: 68,
          minWidth: 68,
          borderRadius: 7,
          margin: '2px 0 2px 4px',
          overflow: 'hidden',
          background: '#E5E5E5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {member.photo ? (
          <img src={member.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <DefaultAvatar color={style.border} />
        )}
      </div>

      {/* Text */}
      <div
        style={{
          marginLeft: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: hasRole ? 'center' : 'center',
          flex: 1,
          minWidth: 0,
          gap: hasRole ? 2 : 0,
        }}
      >
        {hasRole && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: style.sub,
              letterSpacing: '0.5px',
              lineHeight: 1.2,
            }}
          >
            {roleLabel}
          </div>
        )}
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: style.text,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {member.name || '（名前なし）'}
        </div>
        {hasJob && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: style.sub,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {member.job}
          </div>
        )}
      </div>
    </div>
  )
}

function DefaultAvatar({ color }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="14" r="7" fill={color} opacity="0.35" />
      <ellipse cx="18" cy="30" rx="12" ry="7" fill={color} opacity="0.25" />
    </svg>
  )
}
