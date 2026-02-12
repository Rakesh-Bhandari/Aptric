// src/components/Dock/Dock.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, BookOpen, Trophy, UserCircle } from 'lucide-react'; 
import './Dock.css';

const Dock = ({ isAuthenticated }) => {
  const navItems = [
    { path: '/practice', icon: <LayoutGrid size={22} />, label: 'Home' },
    { path: '/topics', icon: <BookOpen size={22} />, label: 'Topics' },
    { path: '/leaderboard', icon: <Trophy size={22} />, label: 'Rank' },
  ];

  if (isAuthenticated) {
    navItems.push({ path: '/profile', icon: <UserCircle size={22} />, label: 'Me' });
  }

  return (
    <aside className="bento-dock-safe-zone">
      <nav className="bento-dock-bar">
        {navItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => `bento-nav-link ${isActive ? 'active' : ''}`}
          >
            <div className="icon-unit">{item.icon}</div>
            <span className="label-unit">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Dock;