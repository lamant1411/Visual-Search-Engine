export const allowedSearchImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const maxSearchImageSize = 10 * 1024 * 1024

export function validateSearchImageFile(file: File): string | undefined {
  if (!allowedSearchImageTypes.includes(file.type)) {
    return 'Unsupported image format. Please use JPG, PNG, or WebP.'
  }

  if (file.size > maxSearchImageSize) {
    return 'This image is larger than 10 MB. Please choose a smaller file.'
  }

  return undefined
}
