import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '../../lib/imageUtils.js'

// メンバー写真アップロード時の切り取りモーダル。正方形固定。
// 決定を押すと160x160のJPEG(data URL)を onConfirm に渡す。
export default function PhotoCropModal({ imageSrc, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleConfirm() {
    if (!croppedAreaPixels || busy) return
    setBusy(true)
    try {
      const base64 = await getCroppedImg(imageSrc, croppedAreaPixels)
      onConfirm(base64)
    } catch (e) {
      console.error('写真の切り取りに失敗', e)
      alert('画像の処理に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(360px, 92vw)', background: 'white', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.30)', zIndex: 61, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>写真を切り取り</div>

        <div style={{ position: 'relative', width: '100%', height: 280, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: '100%' }}
          aria-label="ズーム"
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: '1px solid #D1D5DB', background: 'white',
              cursor: 'pointer', fontSize: 14, color: '#374151',
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: 'none', background: '#7C3AED', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '処理中...' : '決定'}
          </button>
        </div>
      </div>
    </>
  )
}
