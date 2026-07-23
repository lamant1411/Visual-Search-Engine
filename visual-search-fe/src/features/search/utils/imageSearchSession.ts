type StoredImageSearchFile = {
  name: string
  type: string
  lastModified: number
  dataUrl: string
}

const storagePrefix = 'visual-search:image-query:'

export function createImageSearchHistoryKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function saveImageSearchFile(historyKey: string, file: File) {
  try {
    const payload: StoredImageSearchFile = {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      dataUrl: await readFileAsDataUrl(file),
    }
    sessionStorage.setItem(`${storagePrefix}${historyKey}`, JSON.stringify(payload))
  } catch {
    // Tr?nh duy?t c? th? ch?n sessionStorage ho?c file qu? l?n v??t quota.
  }
}

export async function loadImageSearchFile(historyKey: string) {
  try {
    const raw = sessionStorage.getItem(`${storagePrefix}${historyKey}`)
    if (!raw) return null

    const payload = JSON.parse(raw) as StoredImageSearchFile
    const response = await fetch(payload.dataUrl)
    const blob = await response.blob()
    return new File([blob], payload.name, {
      type: payload.type,
      lastModified: payload.lastModified,
    })
  } catch {
    return null
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
