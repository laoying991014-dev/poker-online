import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { Trophy, User, Settings, LogOut, Home, LogIn, UserPlus } from 'lucide-react';

import { getCachedUser, isLoggedIn, logout, getCurrentUser } from '@client/src/api/auth';
import type { UserInfo } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserInfo | null>(getCachedUser());

  useEffect(() => {
    if (isLoggedIn() && !user) {
      getCurrentUser()
        .then((u) => setUser(u))
        .catch(() => {
          logout();
        });
    }
  }, [navigate, user]);

  useEffect(() => {
    const handleAuth401 = (e: Event) => {
      const customEvent = e as CustomEvent<{ redirect?: string }>;
      const redirect = customEvent.detail?.redirect || '/lobby';
      setUser(null);
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
    };
    window.addEventListener('auth:401', handleAuth401);
    return () => window.removeEventListener('auth:401', handleAuth401);
  }, [navigate]);

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate('/lobby');
  };

  const loginRedirectTo = location.pathname === '/login' || location.pathname === '/register'
    ? '/lobby'
    : location.pathname;

  return (
    <div className="min-h-screen bg-[#0a1f14] text-white flex">
      <aside className="w-64 bg-[#0d2818] border-r border-[#1a3d26] flex flex-col">
        <Link to="/lobby" className="p-6 border-b border-[#1a3d26] block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#f5c518] flex items-center justify-center">
              <Trophy className="w-6 h-6 text-[#0a1f14]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#f5c518]">德州扑克</h1>
              <p className="text-xs text-gray-400">Texas Hold&apos;em</p>
            </div>
          </div>
        </Link>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/lobby"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-[#0d7a3e] text-white'
                  : 'text-gray-300 hover:bg-[#1a3d26] hover:text-white'
              }`
            }
          >
            <Home className="w-5 h-5" />
            <span>游戏大厅</span>
          </NavLink>
          {user && (
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#0d7a3e] text-white'
                    : 'text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                }`
              }
            >
              <User className="w-5 h-5" />
              <span>个人中心</span>
            </NavLink>
          )}
          {user?.isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#0d7a3e] text-white'
                    : 'text-gray-300 hover:bg-[#1a3d26] hover:text-white'
                }`
              }
            >
              <Settings className="w-5 h-5" />
              <span>管理后台</span>
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-[#1a3d26]">
          {user ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-10 h-10 border-2 border-[#f5c518]">
                  <AvatarFallback className="bg-[#1a3d26] text-[#f5c518]">
                    {user.nickname?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.nickname}</p>
                  <p className="text-xs text-[#f5c518] flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {user.coins?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-gray-400 hover:text-white hover:bg-[#1a3d26]"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">登录后即可参与对局</p>
              <Button
                variant="default"
                size="sm"
                className="w-full bg-[#f5c518] text-[#0a1f14] hover:bg-[#e0b416] font-semibold"
                onClick={() => navigate(`/login?redirect=${encodeURIComponent(loginRedirectTo)}`)}
              >
                <LogIn className="w-4 h-4 mr-2" />
                登录
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-[#1a3d26] text-gray-300 hover:bg-[#1a3d26] hover:text-white"
                onClick={() => navigate(`/register?redirect=${encodeURIComponent(loginRedirectTo)}`)}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                注册账号
              </Button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
