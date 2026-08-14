import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { HomeIcon, UserIcon, ServerIcon, LogoutIcon } from './Icons';
import Avatar from './Avatar';
import '../index.css';

export default function Sidebar({ user, onLogout }) {
  const getNavClass = ({ isActive }) => (
    `sidebar-item ${isActive ? 'active' : ''}`
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Link to="/servers" className="sidebar-logo-link" title="Back to Servers">
          <img src="/title.png" alt="MonikaShell" className="sidebar-logo-img" />
        </Link>
      </div>

      <div className="sidebar-section">
        <h4 className="sidebar-heading">Dashboard</h4>
        <nav>
          <NavLink to="/servers" className={getNavClass} end>
            <HomeIcon />
            <span>Servers</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-section">
        <h4 className="sidebar-heading">Administration</h4>
        <nav>
          <NavLink to="/admin/users" className={getNavClass}>
            <UserIcon />
            <span>Manage Users</span>
          </NavLink>
          <NavLink to="/admin/servers" className={getNavClass}>
            <ServerIcon />
            <span>Manage Servers</span>
          </NavLink>
        </nav>
      </div>

      <div style={{ flex: 1 }}></div>

      <div className="sidebar-footer">
        <Avatar name={user?.username} size={40} />
        <div className="user-info">
          <span className="user-name">{user?.username || 'admin'}</span>
          <span className="user-role">{user?.role || 'Administrator'}</span>
        </div>
        <button className="sidebar-logout" onClick={onLogout} title="Logout">
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}
