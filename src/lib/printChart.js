// html2canvas / jsPDF は重いので、印刷実行時に動的import（初期バンドルを軽く保つ）

// CSS px ↔ mm（96dpi 基準）
const PX_TO_MM = 25.4 / 96
const MARGIN_MM = 8 // 各ページの余白
const CAPTURE_SCALE = 2 // キャプチャ解像度（印刷用に高め）

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

async function captureRegion(html2canvas, element, x, y, width, height, contentW, contentH) {
  const canvas = await html2canvas(element, {
    x, y, width, height,
    scale: CAPTURE_SCALE,
    backgroundColor: '#ffffff',
    windowWidth: contentW,
    windowHeight: contentH,
    logging: false,
    useCORS: true,
  })
  return canvas.toDataURL('image/png')
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

  if (mode === 'fit') {
    // 全体を1ページに収める（縦横比維持で中央配置）
    const img = await captureRegion(html2canvas, element, 0, 0, contentWidth, contentHeight, contentWidth, contentHeight)
    const scale = Math.min(innerW / (contentWidth * PX_TO_MM), innerH / (contentHeight * PX_TO_MM))
    const wmm = contentWidth * PX_TO_MM * scale
    const hmm = contentHeight * PX_TO_MM * scale
    pdf.addImage(img, 'PNG', (pageW - wmm) / 2, (pageH - hmm) / 2, wmm, hmm)
    pdf.save(fileName)
    return { pages: 1 }
  }

  // ポスター分割
  const tilePxW = innerW / PX_TO_MM
  const tilePxH = innerH / PX_TO_MM
  const cols = Math.max(1, Math.ceil(contentWidth / tilePxW))
  const rows = Math.max(1, Math.ceil(contentHeight / tilePxH))

  // 1ページ目：全体図（貼り合わせの見取り図。升目と番号つき）
  const overview = await captureRegion(html2canvas, element, 0, 0, contentWidth, contentHeight, contentWidth, contentHeight)
  const ovScale = Math.min(innerW / (contentWidth * PX_TO_MM), innerH / (contentHeight * PX_TO_MM))
  const ovW = contentWidth * PX_TO_MM * ovScale
  const ovH = contentHeight * PX_TO_MM * ovScale
  const ovX = (pageW - ovW) / 2
  const ovY = (pageH - ovH) / 2
  pdf.addImage(overview, 'PNG', ovX, ovY, ovW, ovH)
  pdf.setFontSize(10)
  pdf.text(`全体図（${cols}×${rows} 枚に分割／次ページから各ページ）`, MARGIN_MM, MARGIN_MM)
  // 升目と番号を重ねる
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

  // 各タイルを1ページずつ
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tilePxW
      const y = r * tilePxH
      const w = Math.min(tilePxW, contentWidth - x)
      const h = Math.min(tilePxH, contentHeight - y)
      if (w <= 0 || h <= 0) continue
      const img = await captureRegion(html2canvas, element, x, y, w, h, contentWidth, contentHeight)
      pdf.addPage(paper, orientation)
      const wmm = w * PX_TO_MM
      const hmm = h * PX_TO_MM
      pdf.addImage(img, 'PNG', MARGIN_MM, MARGIN_MM, wmm, hmm)
      // ページ番号（貼り合わせ用）
      pdf.setFontSize(9)
      pdf.setTextColor(120)
      pdf.text(`${String.fromCharCode(65 + c)}-${r + 1}`, MARGIN_MM, MARGIN_MM - 2.5)
      pdf.setTextColor(0)
    }
  }

  pdf.save(fileName)
  return { pages: cols * rows + 1 }
}
