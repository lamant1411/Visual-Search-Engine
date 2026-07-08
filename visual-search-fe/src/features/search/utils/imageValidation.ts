export const allowedSearchImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const maxSearchImageSize = 10 * 1024 * 1024

export function validateSearchImageFile(file: File): string | undefined {
  if (!allowedSearchImageTypes.includes(file.type)) {
    return 'Only JPG, PNG, or WebP images are supported.'
  }

  if (file.size > maxSearchImageSize) {
    return 'Image size must be 10MB or smaller.'
  }

  return undefined
}
