import React from 'react';
import { Route, Routes } from 'react-router-dom';

import MobileLayout from './components/MobileLayout';
import NotFound from './pages/NotFound/NotFound';
import LoginPage from './pages/Login/LoginPage';
import RegisterPage from './pages/Register/RegisterPage';
import LobbyPage from './pages/Lobby/LobbyPage';
import RankPage from './pages/Rank/RankPage';
import ClubPage from './pages/Club/ClubPage';
import GameTablePage from './pages/GameTable/GameTablePage';
import ProfilePage from './pages/Profile/ProfilePage';
import AdminPage from './pages/Admin/AdminPage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<MobileLayout />}>
        <Route index element={<LobbyPage />} />
        <Route path="lobby" element={<LobbyPage />} />
        <Route path="rank" element={<RankPage />} />
        <Route path="club" element={<ClubPage />} />
        <Route path="game/:roomId" element={<GameTablePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
