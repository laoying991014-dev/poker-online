import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Trophy, User } from 'lucide-react';

import { isLoggedIn } from '@client/src/api/auth';

const MobileLayout = () => {
  const location = useLocation();
  const loggedIn = isLoggedIn();

  const isGamePage = location.pathname.startsWith('/game/');
  const isAdminPage = location.pathname === '/admin';
  const isAuthPage =
    location.pathname === '/login' || location.pathname === '/register';

  if (isGamePage || isAdminPage || isAuthPage) {
    return (
      <div className="min-h-screen bg-[#0a1f14] text-white">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1f14] text-white pb-20">
      <main className="max-w-xl mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d2818] border-t border-[#1a3d26] safe-pb">
        <div className="max-w-xl mx-auto grid grid-cols-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 transition-colors ${
                isActive ? 'text-[#f5c518]' : 'text-gray-400 hover:text-white'
              }`
            }
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-xs">首页</span>
          </NavLink>

          <NavLink
            to="/rank"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 transition-colors ${
                isActive ? 'text-[#f5c518]' : 'text-gray-400 hover:text-white'
              }`
            }
          >
            <Trophy className="w-5 h-5 mb-0.5" />
            <span className="text-xs">排名赛</span>
          </NavLink>

          <NavLink
            to={loggedIn ? '/profile' : '/login?redirect=%2Fprofile'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 transition-colors ${
                isActive ? 'text-[#f5c518]' : 'text-gray-400 hover:text-white'
              }`
            }
          >
            {loggedIn ? (
              <User className="w-5 h-5 mb-0.5" />
            ) : (
              <User className="w-5 h-5 mb-0.5" />
            )}
            <span className="text-xs">个人中心</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default MobileLayout;
