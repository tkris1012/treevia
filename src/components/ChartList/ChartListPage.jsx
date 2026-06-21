import { useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { navigateToChart } from '../../store/useSync.js'
import { canCreateMoreCharts } from '../../constants/plans.js'
import AccountMenu from '../Auth/AccountMenu.jsx'
import CreateChartModal from './CreateChartModal.jsx'
import RenameChartModal from './RenameChartModal.jsx'

export default function ChartListPage() {
  const charts = useStore((s) => s.charts)
  const createNewChart = useStore((s) => s.createNewChart)
  const deleteChartById = useStore((s) => s.deleteChartById)
  const plan = useStore((s) => s.plan)
  const showUpgrade = useStore((s) => s.showUpgrade)

  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { id, title }
  const [menuOpenId, setMenuOpenId] = useState(null)

  function handleNewClick() {
    if (canCreateMoreCharts(plan, charts.length)) setCreateOpen(true)
    else showUpgrade('charts')
  }

  async function handleCreate(title) {
    const id = await createNewChart(title)
    setCreateOpen(false)
    if (id) navigateToChart(id)
  }

  function handleOpen(chartId) {
    navigateToChart(chartId)
  }

  function handleRename(chart) {
    setRenameTarget({ id: chart.id, title: chart.title })
    setMenuOpenId(null)
  }

  function handleDelete(chartId) {
    deleteChartById(chartId)
    setMenuOpenId(null)
  }

  return (
    <div style={{
      width: '100%', height: '100%', background: '#F3F4F6',
      overflow: 'auto', position: 'relative',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'white', borderBottom: '1px solid #E5E7EB',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', flex: 1 }}>
          🗂 組織図一覧
        </div>
        <AccountMenu />
      </header>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {/* 新規作成カード */}
          <button
            onClick={handleNewClick}
            style={{
              minHeight: 140, borderRadius: 12,
              border: '2px dashed #C4B5FD',
              background: 'white', cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 6, color: '#7C3AED',
              fontSize: 14, fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FAF5FF' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
          >
            <div style={{ fontSize: 32 }}>＋</div>
            <div>新規作成</div>
          </button>

          {/* 既存の組織図カード */}
          {charts.map((c) => (
            <div
              key={c.id}
              style={{
                position: 'relative',
                minHeight: 140, borderRadius: 12,
                background: 'white',
                border: '1px solid #E5E7EB',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'box-shadow 0.15s, transform 0.15s',
              }}
              onClick={() => handleOpen(c.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{
                padding: 20, height: '100%',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ fontSize: 28 }}>🌳</div>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: '#1F2937',
                  lineHeight: 1.4, wordBreak: 'break-word',
                }}>
                  {c.title || '無題'}
                </div>
              </div>

              {/* 三点メニュー */}
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id) }}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 28, height: 28, borderRadius: 6,
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 18, color: '#9CA3AF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                ⋯
              </button>

              {menuOpenId === c.id && (
                <>
                  <div
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(null) }}
                    style={{ position: 'fixed', inset: 0, zIndex: 20 }}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: 40, right: 8,
                      background: 'white', borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      border: '1px solid #E5E7EB',
                      minWidth: 140, zIndex: 21,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => handleRename(c)}
                      style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        textAlign: 'left', border: 'none', background: 'white',
                        cursor: 'pointer', fontSize: 13, color: '#374151',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                    >
                      ✏️ 名前を変更
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        textAlign: 'left', border: 'none', background: 'white',
                        cursor: 'pointer', fontSize: 13, color: '#EF4444',
                        borderTop: '1px solid #F3F4F6',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white' }}
                    >
                      🗑️ 削除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 空状態 */}
        {charts.length === 0 && (
          <div style={{
            marginTop: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 13,
          }}>
            まだ組織図がありません。「＋ 新規作成」から始めてください。
          </div>
        )}
      </div>

      {createOpen && (
        <CreateChartModal onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      )}
      {renameTarget && (
        <RenameChartModal
          chartId={renameTarget.id}
          initialTitle={renameTarget.title}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  )
}
