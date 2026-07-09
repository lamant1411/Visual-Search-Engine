import type { PaginatedResponse } from './types'

export interface BookmarkItem {
  id: number
  image_url: string
  title: string
  saved_at: string
}

export interface BookmarkListParams {
  page?: number
  limit?: number
}

// Mock data với ảnh đa dạng tỷ lệ để thấy rõ Masonry Grid
let mockBookmarks: BookmarkItem[] = [
  {
    id: 1,
    image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
    title: 'Núi tuyết phủ',
    saved_at: '2026-07-09T10:00:00.000Z',
  },
  {
    id: 2,
    image_url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=80',
    title: 'Rừng xanh mướt',
    saved_at: '2026-07-09T09:30:00.000Z',
  },
  {
    id: 3,
    image_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&q=80',
    title: 'Đêm đầy sao',
    saved_at: '2026-07-08T15:00:00.000Z',
  },
  {
    id: 4,
    image_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80',
    title: 'Thung lũng sương mù',
    saved_at: '2026-07-08T12:20:00.000Z',
  },
  {
    id: 5,
    image_url: 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&q=80',
    title: 'Hoàng hôn biển cả',
    saved_at: '2026-07-08T09:00:00.000Z',
  },
  {
    id: 6,
    image_url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=400&q=80',
    title: 'Thác nước hùng vĩ',
    saved_at: '2026-07-07T18:45:00.000Z',
  },
  {
    id: 7,
    image_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&q=80',
    title: 'Rừng mùa thu',
    saved_at: '2026-07-07T14:30:00.000Z',
  },
  {
    id: 8,
    image_url: 'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=400&q=80',
    title: 'Hồ nước trong xanh',
    saved_at: '2026-07-07T11:00:00.000Z',
  },
  {
    id: 9,
    image_url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&q=80',
    title: 'Đồng cỏ bình nguyên',
    saved_at: '2026-07-06T16:00:00.000Z',
  },
  {
    id: 10,
    image_url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=400&q=80',
    title: 'Bờ biển cát trắng',
    saved_at: '2026-07-06T10:30:00.000Z',
  },
  {
    id: 11,
    image_url: 'https://images.unsplash.com/photo-1540206395-68808572332f?w=600&q=80',
    title: 'Đường mòn tuyết',
    saved_at: '2026-07-05T20:00:00.000Z',
  },
  {
    id: 12,
    image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80',
    title: 'Núi đá hùng vĩ',
    saved_at: '2026-07-05T14:00:00.000Z',
  },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const bookmarkApi = {
  async list(params?: BookmarkListParams): Promise<PaginatedResponse<BookmarkItem>> {
    await delay(600)
    const page = params?.page ?? 1
    const limit = params?.limit ?? 20
    const start = (page - 1) * limit
    const items = mockBookmarks.slice(start, start + limit)
    return { items, page, limit, total: mockBookmarks.length }
  },

  async remove(id: number): Promise<{ message: string }> {
    await delay(300)
    mockBookmarks = mockBookmarks.filter((b) => b.id !== id)
    return { message: 'Đã xoá khỏi bookmark.' }
  },
}
