// html2canvas / jsPDF は重いので、印刷実行時に動的import（初期バンドルを軽く保つ）

// CSS px ↔ mm（96dpi 基準）
const PX_TO_MM = 25.4 / 96
const MARGIN_MM = 8 // 各ページの余白
const CAPTURE_SCALE = 2 // 目標キャプチャ解像度（実際は上限内に自動調整）
const JPEG_QUALITY = 0.85 // PDF埋め込み画像はJPEGで軽量化

const PAPER_MM = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
}

// 用紙の「中身を置ける領域」(mm)を向き込みで返す
function pageContentMM(paper, orientation) {
  const base = PAPER_MM[paper] || PAPER_MM.a4
  const w = orientation === 'landscape' ? base.h : base.w
  const h = orientation === 'landscape' ? base.w : base.h
  return { pageW: w, pageH: h, innerW: w - MARGIN_MM * 2, innerH: h - MARGIN_MM * 2 }
}

// 生成前の枚数見積り（プレビュー表示用）
export function estimatePages(contentW, contentH, options) {
  const { mode = 'poster', paper = 'a4', orientation = 'landscape' } = options
  if (mode === 'fit') return 1
  const { innerW, innerH } = pageContentMM(paper, orientation)
  const contentWmm = contentW * PX_TO_MM
  const contentHmm = contentH * PX_TO_MM
  const cols = Math.max(1, Math.ceil(contentWmm / innerW))
  const rows = Math.max(1, Math.ceil(contentHmm / innerH))
  return cols * rows + 1 // +1 = 全体図ページ
}

// キャンバスの安全上限（モバイル Safari の面積上限 ~16M px / 最大寸法に合わせる）
const MAX_CANVAS_DIM = 8192
const MAX_CANVAS_AREA = 16000000 // 16M px（iOSでも安全）

// 全体を1回だけ描画して大きな master canvas を得る（安全上限内に収まるよう scale 自動調整）
async function captureMaster(html2canvas, element, contentW, contentH) {
  let scale = CAPTURE_SCALE
  scale = Math.min(
    scale,
    MAX_CANVAS_DIM / contentW,
    MAX_CANVAS_DIM / contentH,
    Math.sqrt(MAX_CANVAS_AREA / (contentW * contentH)),
  )
  if (!isFinite(scale) || scale <= 0) scale = 1
  const canvas = await html2canvas(element, {
    width: contentW,
    height: contentH,
    windowWidth: contentW,
    windowHeight: contentH,
    scale,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
  })
  return canvas
}

// master canvas の一部を切り出して dataURL にする（再描画せず drawImage で高速）
function sliceDataURL(master, sx, sy, sw, sh) {
  const tmp = document.createElement('canvas')
  tmp.width = Math.max(1, Math.round(sw))
  tmp.height = Math.max(1, Math.round(sh))
  const ctx = tmp.getContext('2d')
  // JPEGは透過不可なので白で塗ってから描画
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(master, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height)
  return tmp.toDataURL('image/jpeg', JPEG_QUALITY)
}

// element（全体サイズで描画済みの非表示DOM）から PDF を生成して保存する。
export async function generateChartPdf({ element, contentWidth, contentHeight, options, fileName }) {
  const { mode = 'poster', paper = 'a4', orientation = 'landscape' } = options
  // 重いライブラリは実行時に読み込む
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const { pageW, pageH, innerW, innerH } = pageContentMM(paper, orientation)
  const pdf = new jsPDF({ orientation, unit: 'mm', format: paper })

  // ★ 全体を1回だけ描画（以降はこの canvas を切り出して使う）
  const master = await captureMaster(html2canvas, element, contentWidth, contentHeight)
  const sx = master.width / contentWidth   // content px → master px の係数
  const sy = master.height / contentHeight

  if (mode === 'fit') {
    const img = sliceDataURL(master, 0, 0, master.width, master.height)
    const scale = Math.min(innerW / (contentWidth * PX_TO_MM), innerH / (contentHeight * PX_TO_MM))
    const wmm = contentWidth * PX_TO_MM * scale
    const hmm = contentHeight * PX_TO_MM * scale
    pdf.addImage(img, 'JPEG', (pageW - wmm) / 2, (pageH - hmm) / 2, wmm, hmm)
    pdf.save(fileName)
    return { pages: 1 }
  }

  // ポスター分割
  const tilePxW = innerW / PX_TO_MM
  const tilePxH = innerH / PX_TO_MM
  const cols = Math.max(1, Math.ceil(contentWidth / tilePxW))
  const rows = Math.max(1, Math.ceil(contentHeight / tilePxH))

  // 1ページ目：全体図（升目と番号つき）
  const overview = sliceDataURL(master, 0, 0, master.width, master.height)
  const ovScale = Math.min(innerW / (contentWidth * PX_TO_MM), innerH / (contentHeight * PX_TO_MM))
  const ovW = contentWidth * PX_TO_MM * ovScale
  const ovH = contentHeight * PX_TO_MM * ovScale
  const ovX = (pageW - ovW) / 2
  const ovY = (pageH - ovH) / 2
  pdf.addImage(overview, 'JPEG', ovX, ovY, ovW, ovH)
  pdf.setFontSize(10)
  pdf.text(`全体図（${cols}×${rows} 枚に分割／次ページから各ページ）`, MARGIN_MM, MARGIN_MM)
  pdf.setDrawColor(150)
  pdf.setTextColor(120)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = ovX + (ovW * c) / cols
      const gy = ovY + (ovH * r) / rows
      pdf.rect(gx, gy, ovW / cols, ovH / rows)
      pdf.text(`${String.fromCharCode(65 + c)}-${r + 1}`, gx + 1.5, gy + 4)
    }
  }
  pdf.setTextColor(0)

  // 各タイル：master から切り出すだけ（再描画なし）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tilePxW
      const y = r * tilePxH
      const w = Math.min(tilePxW, contentWidth - x)
      const h = Math.min(tilePxH, contentHeight - y)
      if (w <= 0 || h <= 0) continue
      const img = sliceDataURL(master, x * sx, y * sy, w * sx, h * sy)
      pdf.addPage(paper, orientation)
      pdf.addImage(img, 'JPEG', MARGIN_MM, MARGIN_MM, w * PX_TO_MM, h * PX_TO_MM)
      pdf.setFontSize(9)
      pdf.setTextColor(120)
      pdf.text(`${String.fromCharCode(65 + c)}-${r + 1}`, MARGIN_MM, MARGIN_MM - 2.5)
      pdf.setTextColor(0)
    }
  }

  pdf.save(fileName)
  return { pages: cols * rows + 1 }
}
