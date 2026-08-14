import React, { useEffect, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (data.user) {
          setUser({ ...data.user, role: data.user.is_admin ? 'Administrator' : 'User' });
        } else {
          navigate('/login');
        }
      })
      .catch(() => navigate('/login'));
  }, [navigate]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  };

  return (
    <div className="app-container layout-container">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
