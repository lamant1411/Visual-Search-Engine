import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, LogOut, Search, Shield, User } from 'lucide-react';
import { Button } from '@/components/base/button';
import { useAuth } from '@/contexts/AuthContext';

export function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userInitial = user?.email?.charAt(0).toUpperCase() ?? 'U';

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-2/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/search" className="flex items-center gap-2 font-semibold text-ink-primary">
          <Search className="h-5 w-5 text-accent-600" />
          <span>Visual Search</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Clock className="h-4 w-4" />}
            onClick={() => navigate('/history')}
          >
            History
          </Button>

          {user?.role === 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Shield className="h-4 w-4" />}
              onClick={() => navigate('/admin')}
            >
              Admin
            </Button>
          )}

          {isAuthenticated ? (
            <>
              <div
                className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700"
                aria-label={user?.email ?? 'Tài khoản'}
                title={user?.email ?? 'Tài khoản'}
              >
                {user?.email ? userInitial : <User className="h-4 w-4" />}
              </div>

              <Button
                variant="outline"
                size="sm"
                loading={isLoggingOut}
                leftIcon={<LogOut className="h-4 w-4" />}
                onClick={handleLogout}
              >
                Logout
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
              Login
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
