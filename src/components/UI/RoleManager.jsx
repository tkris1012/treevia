import { useStore } from '../../store/useStore.js'
import { MAX_ROLES, ROLE_COLOR_PRESETS, roleStyleFromColor } from '../../constants/roles.js'

export default function RoleManager() {
  const open        = useStore((s) => s.roleManagerOpen)
  const close       = useStore((s) => s.closeRoleManager)
  const roles       = useStore((s) => s.roles)
  const addRole     = useStore((s) => s.addRole)
  const updateRole  = useStore((s) => s.updateRole)
  const deleteRole  = useStore((s) => s.deleteRole)
  const moveRole    = useStore((s) => s.moveRole)

  if (!open) return null

  const atMax = roles.length >= MAX_ROLES

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 55,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

      <div style={{
        position: 'relative', background: 'white', borderRadius: 16,
        width: 'min(480px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 70px rgba(0,0,0,0.30)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#1F2937' }}>役職の管理</div>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{roles.length} / {MAX_ROLES}</span>
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px', lineHeight: 1.6 }}>
            上にある役職ほど上位（フィルタの「○○以上」に反映）。名前と色を自由に設定できます。
          </p>

          {roles.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '24px 0' }}>
              まだ役職がありません。「＋ 役職を追加」から作成してください。
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {roles.map((r, i) => {
              const st = roleStyleFromColor(r.color)
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 8, borderRadius: 10, border: '1px solid #E5E7EB',
                }}>
                  {/* 並び替え */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moveRole(r.id, -1)} disabled={i === 0}
                      style={arrowBtn(i === 0)}>▲</button>
                    <button onClick={() => moveRole(r.id, +1)} disabled={i === roles.length - 1}
                      style={arrowBtn(i === roles.length - 1)}>▼</button>
                  </div>

                  {/* 色 */}
                  <label style={{
                    width: 28, height: 28, borderRadius: 7, cursor: 'pointer', position: 'relative',
                    border: `2px solid ${st.border}`, background: st.fill, flexShrink: 0,
                  }} title="色を変更">
                    <input type="color" value={r.color}
                      onChange={(e) => updateRole(r.id, { color: e.target.value })}
                      style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                  </label>

                  {/* 名前 */}
                  <input
                    type="text"
                    value={r.name}
                    maxLength={20}
                    onChange={(e) => updateRole(r.id, { name: e.target.value })}
                    placeholder="役職名"
                    style={{
                      flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8,
                      border: '1px solid #D1D5DB', fontSize: 14, outline: 'none',
                    }}
                  />

                  {/* 削除 */}
                  <button onClick={() => deleteRole(r.id)} title="削除"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#EF4444', fontSize: 16, padding: 4 }}>
                    🗑️
                  </button>
                </div>
              )
            })}
          </div>

          {/* 追加 */}
          <button
            onClick={() => addRole('新しい役職', ROLE_COLOR_PRESETS[roles.length % ROLE_COLOR_PRESETS.length])}
            disabled={atMax}
            style={{
              marginTop: 12, width: '100%', padding: '10px', borderRadius: 10,
              border: '1px dashed #C4B5FD', background: atMax ? '#F3F4F6' : '#FAF5FF',
              color: atMax ? '#9CA3AF' : '#7C3AED', fontSize: 14, fontWeight: 600,
              cursor: atMax ? 'not-allowed' : 'pointer',
            }}
          >
            {atMax ? `上限（${MAX_ROLES}個）に達しました` : '＋ 役職を追加'}
          </button>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F0F0F0' }}>
          <button onClick={close} style={{
            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            background: '#7C3AED', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            完了
          </button>
        </div>
      </div>
    </div>
  )
}

function arrowBtn(disabled) {
  return {
    border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer',
    color: disabled ? '#D1D5DB' : '#6B7280', fontSize: 9, lineHeight: 1.2, padding: '1px 3px',
  }
}
