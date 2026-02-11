// src/components/Navbar/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext'; 
import './Navbar.css';

import GradientText from '../../assets/styles/Navbar/GradientText';
import logoSymbol from '/LOGO.png'; 

const Navbar = ({ isAuthenticated, onAuthClick, setIsAuthenticated }) => {
  const navigate = useNavigate();
  // 1. Get 'theme' alongside reduceMotion
  const { reduceMotion, theme } = usePreferences();

  const [isOpen, setIsOpen] = useState(false);
  
  const navRef = useRef(null);
  const smokeRef = useRef(null);
  
  const mousePos = useRef({ x: -100, y: -100 });
  const smokePos = useRef({ x: -100, y: -100 });

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:5000/auth/logout', { credentials: 'include' });
      setIsAuthenticated(false);
      navigate('/');
      closeMenu();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleMouseMove = (e) => {
    if (reduceMotion || !navRef.current) return;
    const rect = navRef.current.getBoundingClientRect();
    mousePos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  useEffect(() => {
    if (reduceMotion) return;
    let animationFrameId;

    const animateSmoke = () => {
      const ease = 0.12; 
      smokePos.current.x += (mousePos.current.x - smokePos.current.x) * ease;
      smokePos.current.y += (mousePos.current.y - smokePos.current.y) * ease;

      if (navRef.current) {
        navRef.current.style.setProperty('--smoke-x', `${smokePos.current.x}px`);
        navRef.current.style.setProperty('--smoke-y', `${smokePos.current.y}px`);
      }
      animationFrameId = requestAnimationFrame(animateSmoke);
    };

    animateSmoke();
    return () => cancelAnimationFrame(animationFrameId);
  }, [reduceMotion]);

  // 2. Define Gradient Colors based on Theme
  // Dark Mode: White -> Green
  // Light Mode: Dark Slate -> Green
  const logoColors = theme === 'light' 
    ? ["#0f172a", "#4caf50"] 
    : ["#e6edf3", "#4caf50"];

  return (
    <nav 
      className="main-nav" 
      ref={navRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mousePos.current = { x: -100, y: -100 } }} 
    >
      <div className="nav-background-wrapper">
        {!reduceMotion && <div className="nav-smoke-blob" ref={smokeRef}></div>}
      </div>

      <div className="nav-brand">
        <Link to={isAuthenticated ? "/practice" : "/"} onClick={closeMenu}>
          <img 
            src={logoSymbol} 
            alt="Aptric Logo" 
            className="brand-logo-symbol" 
          />
          
          <GradientText
            colors={logoColors} /* 3. Pass dynamic colors */
            animationSpeed={reduceMotion ? 0 : 5}
            showBorder={false}
            className="brand-text"
          >
            Aptric
          </GradientText>
        
        </Link>
      </div>

      <button
        className={`hamburger ${isOpen ? 'active' : ''}`}
        onClick={toggleMenu}
        aria-label="Menu"
      >
        <span className="bar"></span>
        <span className="bar"></span>
        <span className="bar"></span>
      </button>

      <div className={`nav-links ${isOpen ? 'active' : ''}`}>
        <Link to="/practice" onClick={closeMenu}>Practice</Link>
        <Link to="/topics" onClick={closeMenu}>Topics</Link>
        <Link to="/leaderboard" onClick={closeMenu}>Leaderboard</Link>
        <Link to="/about" onClick={closeMenu}>About</Link>
        {isAuthenticated && <Link to="/profile" onClick={closeMenu}>My Progress</Link>}
        <Link to="/feedback" onClick={closeMenu}>Feedback</Link>

        <div className="menu-auth-container">
          {!isAuthenticated ? (
            <button className="login-btn primary" onClick={() => { onAuthClick(); closeMenu(); }}>
              Sign In
            </button>
          ) : (
            <button className="login-btn logout-btn" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;