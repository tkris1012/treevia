import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore.js'

export default function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm)
  const closeConfirm = useStore((s) => s.closeConfirm)
  const [checked, setChecked] = useState(false)

  // 新しい確認ダイアログが開くたびに、チェック状態をリセットする
  useEffect(() => { setChecked(false) }, [confirm])

  if (!confirm) return null

  function handleOk() {
    confirm.onOk(checked)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={closeConfirm} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl p-6 w-80 max-w-[90vw] flex flex-col gap-4">
        <p className="text-sm text-gray-700 leading-relaxed">{confirm.message}</p>

        {confirm.checkbox && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {confirm.checkbox.label}
          </label>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={closeConfirm}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
          >
            キャンセル
          </button>
          <button
            onClick={handleOk}
            className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
