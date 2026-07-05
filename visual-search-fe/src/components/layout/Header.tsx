import { Link } from 'react-router';
import { Search, Clock, Bookmark, User } from 'lucide-react';
import { Button } from '@/components/base/button';

/**
 * Header dùng chung cho AppShell và AdminShell.
 *
 * TẠM THỜI TĨNH: chưa đọc AuthContext. Khi AuthContext xong, thay 2 chỗ:
 *  1. Ẩn "History/Bookmarks/avatar" nếu chưa login → hiện nút "Đăng nhập"
 *  2. Avatar hiển thị chữ cái đầu email thật thay vì icon User cứng
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-2/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/search" className="flex items-center gap-2 font-semibold text-ink-primary">
          <Search className="h-5 w-5 text-accent-600" />
          <span>Visual Search</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" leftIcon={<Clock className="h-4 w-4" />}>
            History
          </Button>
          <Button variant="ghost" size="sm" leftIcon={<Bookmark className="h-4 w-4" />}>
            Bookmarks
          </Button>

          {/* placeholder — thay bằng avatar/email thật khi có AuthContext */}
          <button
            type="button"
            className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-accent-700"
            aria-label="Tài khoản"
          >
            <User className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}
