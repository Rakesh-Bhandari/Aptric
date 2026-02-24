import React, { useState, useEffect } from 'react';
import './Home.css';
import { useNavigate } from 'react-router-dom';

const Home = ({ isAuthenticated, onAuthClick }) => {
    const navigate = useNavigate();

    // Typing Effect State
    const fullText = "Initialize your cognitive training protocols. Join thousands of operatives enhancing their aptitude in real-time.";
    const [displayedText, setDisplayedText] = useState("");

    useEffect(() => {
        let index = 0;
        const timer = setInterval(() => {
            setDisplayedText((prev) => prev + fullText.charAt(index));
            index++;
            if (index === fullText.length) clearInterval(timer);
        }, 30); // Speed of typing
        return () => clearInterval(timer);
    }, []);

    const handlePracticeClick = () => {
        if (!isAuthenticated) {
            onAuthClick();
        } else {
            navigate('/practice');
        }
    };

    return (
        <div className="hero-section">
            {/* System Status Badge */}
            <div className="system-status-badge">
                <div className="status-dot"></div>
                SYSTEM_ONLINE // V.0.0.1
            </div>

            <div className="hero-content">
                <h1 className="hero-title">
                    Master Your <br />
                    <span>Aptitude</span>
                </h1>

                <div className="hero-description">
                    {displayedText}
                    <span className="typing-cursor"></span>
                </div>

                <div className="cta-buttons">
                    <button
                        onClick={handlePracticeClick}
                        className="hero-btn primary"
                    >
                        INITIATE_TRAINING
                    </button>

                    <button
                        onClick={() => navigate('/about')}
                        className="hero-btn secondary"
                    >
                        SYSTEM_INFO
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Home;