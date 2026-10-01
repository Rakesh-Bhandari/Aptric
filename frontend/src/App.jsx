// src/App.jsx
import { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { gsap } from 'gsap';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { AuthModalProvider, useAuthModal } from './context/AuthModalContext';

import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import RequireAuth from './components/RouteGuards/RequireAuth';
import OnboardingGate from './components/RouteGuards/OnboardingGate';
import Admin from './pages/Admin/Admin';
import Home from './pages/Home/Home';
import Practice from './pages/Practice/Practice';
import Profile from './pages/Profile/Profile';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import About from './pages/About/About';
import Feedback from './pages/Feedback/Feedback';
import Help from './pages/Help/Help';
import Terms from './pages/Terms/Terms';
import Contact from './pages/Contact/Contact';
import UserDetails from './pages/Admin/UserDetails';
import Topics from './pages/Topics/Topics';
import TopicQuestions from './pages/Topics/TopicQuestions';
import SolveQuestion from './pages/Practice/SolveQuestion';
import QuestionDetails from './pages/Admin/QuestionDetails';
import AuthCallback from './pages/AuthCallback/AuthCallback';
import ResetPassword from './pages/ResetPassword/ResetPassword';
import Onboarding from './pages/Onboarding/Onboarding';
import NotFound from './pages/NotFound/NotFound';
import './assets/styles/styles.css';
import './assets/styles/lightmode.css'
import './App.css';

const AppContent = () => {
  const { reduceMotion } = usePreferences();

  const { isAuthenticated } = useSession();
  const { openAuth } = useAuthModal();
  const spotlightRef = useRef(null);

  useEffect(() => {
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
    spotlight.style.display = 'block';
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

      gsap.to(spotlightRef.current, { left: clientX, top: clientY, duration: 0.1, ease: 'power2.out' });

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

      const targetOpacity = minDistance <= proximity ? 0.8
        : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
          : 0;

      gsap.to(spotlightRef.current, { opacity: targetOpacity, duration: targetOpacity > 0 ? 0.2 : 0.5, ease: 'power2.out' });
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
  }, [reduceMotion]);

  const handleAuthTrigger = () => {
    if (!isAuthenticated) openAuth();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main className={reduceMotion ? '' : 'page-enter'} style={{ flex: 1 }}>
        <Routes>
          <Route element={<OnboardingGate />}>
            <Route path="/" element={<Home isAuthenticated={isAuthenticated} onAuthClick={handleAuthTrigger} />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/about" element={<About />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/help" element={<Help />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/user/:id" element={<UserDetails />} />
            <Route path="/admin/question/:id" element={<QuestionDetails />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />

            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/practice" element={<Practice />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/practice/topic" element={<TopicQuestions />} />
              <Route path="/solve/:qid" element={<SolveQuestion />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <PreferencesProvider>
        <Router>
          <SessionProvider>
            <AuthModalProvider>
              <AppContent />
            </AuthModalProvider>
          </SessionProvider>
        </Router>
      </PreferencesProvider>
    </ErrorBoundary>
  );
}

export default App;