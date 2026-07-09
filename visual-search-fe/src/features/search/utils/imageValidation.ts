export const allowedSearchImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const maxSearchImageSize = 10 * 1024 * 1024

export function validateSearchImageFile(file: File): string | undefined {
  if (!allowedSearchImageTypes.includes(file.type)) {
    return 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.'
  }

  if (file.size > maxSearchImageSize) {
    return 'Dung lượng ảnh không được vượt quá 10MB.'
  }

  return undefined
}
