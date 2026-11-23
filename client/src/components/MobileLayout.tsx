import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Trophy, User, Spade } from 'lucide-react';
import { isLoggedIn } from '@client/src/api/auth';

const MobileLayout = () => {
  const location = useLocation();
  const loggedIn = isLoggedIn();
  const isGamePage = location.pathname.startsWith('/game/');
  const isAdminPage = location.pathname === '/admin';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  if (isGamePage || isAdminPage || isAuthPage) {
    return <div className="pokerrrr-app min-h-screen text-white"><Outlet /></div>;
  }

  return (
    <div className="pokerrrr-app min-h-screen text-white pb-20 md:pb-0">
      <header className="pokerrrr-topbar sticky top-0 z-40">
        <div className="pokerrrr-content flex items-center justify-between py-3">
          <NavLink to="/lobby" className="flex items-center gap-3 no-underline">
            <span className="pokerrrr-brand-mark"><Spade className="h-5 w-5" /></span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-[.18em] text-[#f0d39a]">POKER CLUB</span>
              <span className="block text-[10px] tracking-[.22em] text-[#a99577]">PRIVATE TABLES · TEXAS HOLD'EM</span>
            </span>
          </NavLink>
          <span className="rounded-full border border-[#b58a50]/40 bg-[#2b2016] px-3 py-1 text-[10px] tracking-widest text-[#d9b477]">
            ONLINE CLUB
          </span>
        </div>
      </header>

      <main className="pokerrrr-content py-5 md:py-8">
        <Outlet />
      </main>

      <nav className="pokerrrr-bottom-nav fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:left-1/2 md:right-auto md:w-[min(560px,calc(100%-32px))] md:-translate-x-1/2">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          <NavLink to="/lobby" end className="flex flex-col items-center justify-center gap-1 py-2 text-xs text-[#a99577] transition-colors">
            <Home className="h-5 w-5" /><span>游戏大厅</span>
          </NavLink>
          <NavLink to="/rank" className="flex flex-col items-center justify-center gap-1 py-2 text-xs text-[#a99577] transition-colors">
            <Trophy className="h-5 w-5" /><span>排行榜</span>
          </NavLink>
          <NavLink to={loggedIn ? '/profile' : '/login?redirect=%2Fprofile'} className="flex flex-col items-center justify-center gap-1 py-2 text-xs text-[#a99577] transition-colors">
            <User className="h-5 w-5" /><span>个人中心</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
};

export default MobileLayout;
