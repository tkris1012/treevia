function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}

// クロップ済み矩形(pixelCrop)を、正方形の出力サイズに描画してJPEGのdata URLにする。
// react-easy-crop の onCropComplete が返す { x, y, width, height }（元画像基準のpx）を渡す想定。
export async function getCroppedImg(imageSrc, pixelCrop, outputSize = 160, quality = 0.78) {
  const img = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize

  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputSize, outputSize,
  )

  return canvas.toDataURL('image/jpeg', quality)
}
