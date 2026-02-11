// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { gsap } from 'gsap';
import { useTheme } from './hooks/useTheme';
import { useClickSpark } from './hooks/useClickSpark';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext'; // Import Context

// ... imports for components (Navbar, Auth, etc.) ...
import Navbar from './components/Navbar/Navbar';
import Auth from './components/Auth/Auth';
import Admin from './pages/Admin/Admin';
import Home from './pages/Home/Home';
import Practice from './pages/Practice/Practice';
import Profile from './pages/Profile/Profile';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import About from './pages/About/About';
import Feedback from './pages/Feedback/Feedback';
import Help from './pages/Help/Help';
import UserDetails from './pages/Admin/UserDetails';
import Topics from './pages/Topics/Topics';
import TopicQuestions from './pages/Topics/TopicQuestions';
import SolveQuestion from './pages/Practice/SolveQuestion';
import QuestionDetails from './pages/Admin/QuestionDetails';
import ActivateAccount from './pages/ActivateAccount/ActivateAccount';
import './assets/styles/styles.css';
import './App.css';

// Create an inner component to consume the Context
const AppContent = () => {
  useTheme();
  useClickSpark();

  // Consume Preferences
  const { reduceMotion } = usePreferences();

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const spotlightRef = useRef(null);

  // Add this to your top-level React component
  useEffect(() => {
    const syncLogout = (event) => {
      if (event.key === 'login-event') {
        // If another tab just logged in, refresh this tab to get the session
        window.location.reload();
      }
    };
    window.addEventListener('storage', syncLogout);
    return () => window.removeEventListener('storage', syncLogout);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/user', { credentials: 'include' });
        const data = await response.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          localStorage.setItem('login-success', Date.now());
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  // --- MAGIC BENTO LOGIC (Updated) ---
  useEffect(() => {
    // If animations are disabled, ensure spotlight is removed and return early
    if (reduceMotion) {
      if (spotlightRef.current) spotlightRef.current.style.display = 'none';
      return;
    }

    let spotlight = document.querySelector('.global-spotlight');
    if (!spotlight) {
      spotlight = document.createElement('div');
      spotlight.className = 'global-spotlight';
      document.body.appendChild(spotlight);
    }
    spotlight.style.display = 'block'; // Ensure it's visible if we re-enabled it
    spotlightRef.current = spotlight;

    const spotlightRadius = 300;

    const updateCardGlowProperties = (card, mouseX, mouseY, glow) => {
      const rect = card.getBoundingClientRect();
      const relativeX = ((mouseX - rect.left) / rect.width) * 100;
      const relativeY = ((mouseY - rect.top) / rect.height) * 100;

      card.style.setProperty('--glow-x', `${relativeX}%`);
      card.style.setProperty('--glow-y', `${relativeY}%`);
      card.style.setProperty('--glow-intensity', glow.toString());
      card.style.setProperty('--glow-radius', `${spotlightRadius}px`);
    };

    const handleMouseMove = (e) => {
      if (!spotlightRef.current) return;
      const cards = document.querySelectorAll('.card, .topic-card, .stat-card, .rank-card, .about-section, .faq-item, .feedback-item');
      const { clientX, clientY } = e;

      gsap.to(spotlightRef.current, {
        left: clientX,
        top: clientY,
        duration: 0.1,
        ease: 'power2.out'
      });

      let minDistance = Infinity;
      const proximity = spotlightRadius * 0.5;
      const fadeDistance = spotlightRadius * 0.75;

      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(clientX - centerX, clientY - centerY) - Math.max(rect.width, rect.height) / 2;
        const effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);

        let glowIntensity = 0;
        if (effectiveDistance <= proximity) glowIntensity = 1;
        else if (effectiveDistance <= fadeDistance) glowIntensity = (fadeDistance - effectiveDistance) / (fadeDistance - proximity);

        updateCardGlowProperties(card, clientX, clientY, glowIntensity);
      });

      const targetOpacity = minDistance <= proximity ? 0.8 : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8 : 0;

      gsap.to(spotlightRef.current, {
        opacity: targetOpacity,
        duration: targetOpacity > 0 ? 0.2 : 0.5,
        ease: 'power2.out'
      });
    };

    const handleMouseLeave = () => {
      gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3 });
      const cards = document.querySelectorAll('.card, .topic-card, .stat-card, .rank-card, .about-section, .faq-item, .feedback-item');
      cards.forEach(card => card.style.setProperty('--glow-intensity', '0'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.body.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.body.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [reduceMotion]); // Re-run if preference changes

  const handleAuthTrigger = () => {
    if (!isAuthenticated) setIsAuthOpen(true);
  };

  if (loading) return null;

  return (
    <Router>
      <Navbar isAuthenticated={isAuthenticated} onAuthClick={handleAuthTrigger} setIsAuthenticated={setIsAuthenticated} />
      <main className={reduceMotion ? '' : 'page-enter'}>
        <Routes>
          <Route path="/" element={<Home isAuthenticated={isAuthenticated} onAuthClick={handleAuthTrigger} />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/user/:id" element={<UserDetails />} />
          <Route path="/admin/question/:id" element={<QuestionDetails />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/practice/topic" element={<TopicQuestions />} />
          <Route path="/solve/:qid" element={<SolveQuestion />} />
          <Route
            path="/activate/:token"
            element={<ActivateAccount setIsAuthenticated={setIsAuthenticated} />}
          />
        </Routes>
      </main>
      <Auth isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} setIsAuthenticated={setIsAuthenticated} />
    </Router>
  );
};

// Wrap main App with Provider
function App() {
  return (
    <PreferencesProvider>
      <AppContent />
    </PreferencesProvider>
  );
}

export default App;