import type { Area } from 'react-easy-crop'

const maxOutputDimension = 1600

export async function cropImageFile(file: File, sourceUrl: string, cropArea: Area): Promise<File> {
  const image = await loadImage(sourceUrl)
  const scale = Math.min(1, maxOutputDimension / Math.max(cropArea.width, cropArea.height))
  const outputWidth = Math.max(1, Math.round(cropArea.width * scale))
  const outputHeight = Math.max(1, Math.round(cropArea.height * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Your browser does not support image cropping.')
  }

  canvas.width = outputWidth
  canvas.height = outputHeight
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, outputType)
  const extension = outputType === 'image/png' ? 'png' : 'jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'search-image'

  return new File([blob], `${baseName}-cropped.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  })
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to read the selected image.'))
    image.src = sourceUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, outputType: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Unable to create the cropped image.'))
        }
      },
      outputType,
      0.92,
    )
  })
}
