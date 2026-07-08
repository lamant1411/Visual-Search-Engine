import type { PaginatedResponse } from './types'

export type SearchQueryType = 'image' | 'semantic' | 'ocr'

export interface HistoryItem {
  id: number
  query_type: SearchQueryType
  query_value: string
  created_at: string
}

export interface HistoryListParams {
  page?: number
  limit?: number
}

// Dữ liệu mock phục vụ hiển thị
let mockHistoryItems: HistoryItem[] = [
  {
    id: 1,
    query_type: 'image',
    query_value: 'https://media-cdn-v2.laodong.vn/storage/newsportal/2023/8/26/1233821/Giai-Nhi-1--Nang-Tre.jpg',
    created_at: '2026-07-08T10:30:00.000Z',
  },
  {
    id: 2,
    query_type: 'semantic',
    query_value: 'Phong cảnh ruộng bậc thang Tây Bắc mùa lúa chín vàng óng',
    created_at: '2026-07-08T09:15:00.000Z',
  },
  {
    id: 3,
    query_type: 'ocr',
    query_value: 'Cà phê rang xay nguyên chất 100%',
    created_at: '2026-07-07T15:45:00.000Z',
  },
  {
    id: 4,
    query_type: 'image',
    query_value: 'https://media-cdn-v2.laodong.vn/storage/newsportal/2023/8/26/1233821/Giai-Nhi-1--Nang-Tre.jpg',
    created_at: '2026-07-07T08:20:00.000Z',
  },
  {
    id: 5,
    query_type: 'semantic',
    query_value: 'Thành phố Hồ Chí Minh về đêm lung linh ánh đèn',
    created_at: '2026-07-06T11:00:00.000Z',
  },
]

// Giả lập độ trễ của API
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const historyApi = {
  /**
   * Lấy danh sách lịch sử tìm kiếm (Giả lập phân trang và lọc)
   */
  async list(params?: HistoryListParams): Promise<PaginatedResponse<HistoryItem>> {
    await delay(600) // tạo cảm giác loading thật
    const page = params?.page || 1
    const limit = params?.limit || 10
    const start = (page - 1) * limit
    const end = start + limit

    const items = mockHistoryItems.slice(start, end)
    return {
      items,
      page,
      limit,
      total: mockHistoryItems.length,
    }
  },

  /**
   * Xóa một mục lịch sử tìm kiếm
   */
  async delete(id: number): Promise<{ message: string }> {
    await delay(300)
    mockHistoryItems = mockHistoryItems.filter((item) => item.id !== id)
    return { message: 'Xóa lịch sử tìm kiếm thành công.' }
  },

  /**
   * Xóa toàn bộ lịch sử tìm kiếm
   */
  async deleteAll(): Promise<{ message: string }> {
    await delay(500)
    mockHistoryItems = []
    return { message: 'Đã xóa toàn bộ lịch sử tìm kiếm.' }
  },

  /**
   * Xóa nhiều mục lịch sử tìm kiếm
   */
  async deleteMultiple(ids: number[]): Promise<{ message: string }> {
    await delay(400)
    mockHistoryItems = mockHistoryItems.filter((item) => !ids.includes(item.id))
    return { message: 'Đã xóa các mục lịch sử được chọn.' }
  },
}
