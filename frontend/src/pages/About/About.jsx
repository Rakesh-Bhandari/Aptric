import React from 'react';
import './About.css';
import API_BASE_URL from '../../utils/config';

// --- ICONS ---
const Icons = {
    Cpu: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>,
    Code: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>,
    Zap: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
    Globe: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>,
    Shield: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
    Server: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
};

const About = () => {
  return (
    <div className="about-container">
      
      {/* 1. Header */}
      <div className="about-header">
        <div className="system-status">
            <div className="status-dot"></div> SYSTEM ONLINE
        </div>
        <h1 className="glitch-title">Platform_Overview</h1>
        <p style={{color:'var(--text-secondary)', fontFamily:'Michroma', fontSize:'0.9rem'}}>
            V 2.4.0 // STABLE BUILD
        </p>
      </div>

      {/* 2. Bento Grid Layout */}
      <div className="bento-grid">

        {/* A. Core Directive (Mission) - Wide Card */}
        <div className="info-card card-mission">
            <span className="card-label">CORE DIRECTIVE</span>
            <h2 className="card-title">Mission Protocol</h2>
            <div className="terminal-window">
                <div><span className="cmd-prompt">root@aptitude:~$</span> cat mission.txt</div>
                <br/>
                <div style={{color:'#e6edf3'}}>
                    "To engineer the ultimate logical reasoning engine. We provide a gamified, data-driven environment for mastering aptitude through consistency and adaptive algorithms."
                </div>
                <br/>
                <div><span className="cmd-prompt">root@aptitude:~$</span> <span className="cursor">_</span></div>
            </div>
        </div>

        {/* B. System Stats - Tall Side Card (Spans 2 rows) */}
        <div className="info-card card-stats">
            <span className="card-label">SYSTEM METRICS</span>
            <h2 className="card-title">Live Data</h2>
            
            <div className="stat-row">
                <span className="stat-name">Uptime</span>
                <span className="stat-val" style={{color:'var(--accent-green)'}}>99.9%</span>
            </div>
            <div className="stat-row">
                <span className="stat-name">Questions</span>
                <span className="stat-val">1,500+</span>
            </div>
            <div className="stat-row">
                <span className="stat-name">Active Users</span>
                <span className="stat-val">842</span>
            </div>
            <div className="stat-row">
                <span className="stat-name">Daily Gen</span>
                <span className="stat-val">Automated</span>
            </div>
            
            <div style={{marginTop:'2rem', borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'1rem'}}>
                <span className="stat-name">Server Region</span>
                <div style={{display:'flex', alignItems:'center', gap:'10px', marginTop:'5px', color:'white'}}>
                    <Icons.Globe /> Asia-Pacific (AP-1)
                </div>
            </div>
        </div>

        {/* C. Feature 1 */}
        <div className="info-card card-feature">
            <div className="icon-box"><Icons.Cpu /></div>
            <span className="card-label">MODULE A</span>
            <h3 className="card-title" style={{fontSize:'1.2rem'}}>Daily AI Gen</h3>
            <p className="card-text">
                10 fresh questions generated every 24h cycle. Logic gates reset at midnight.
            </p>
        </div>

        {/* D. Feature 2 */}
        <div className="info-card card-feature">
            <div className="icon-box"><Icons.Zap /></div>
            <span className="card-label">MODULE B</span>
            <h3 className="card-title" style={{fontSize:'1.2rem'}}>Performance</h3>
            <p className="card-text">
                Real-time analytics engine tracking accuracy, velocity, and streak retention.
            </p>
        </div>

        {/* E. Feature 3 */}
        <div className="info-card card-feature">
            <div className="icon-box"><Icons.Shield /></div>
            <span className="card-label">MODULE C</span>
            <h3 className="card-title" style={{fontSize:'1.2rem'}}>Adaptive Rank</h3>
            <p className="card-text">
                Dynamic difficulty scaling. System evolves from Beginner to Expert based on user input.
            </p>
        </div>

        {/* F. NEW: System Architecture (Spans remaining 2 cols) */}
        <div className="info-card card-tech">
            <span className="card-label">INFRASTRUCTURE</span>
            <h2 className="card-title" style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <Icons.Server /> Architecture
            </h2>
            <div className="tech-stack-grid">
                <div className="tech-item"><div className="tech-dot"></div>React.js</div>
                <div className="tech-item"><div className="tech-dot"></div>Node Runtime</div>
                <div className="tech-item"><div className="tech-dot"></div>Express API</div>
                <div className="tech-item"><div className="tech-dot"></div>MySQL DB</div>
                <div className="tech-item"><div className="tech-dot"></div>Passport Auth</div>
                <div className="tech-item"><div className="tech-dot"></div>Bento UI</div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default About;