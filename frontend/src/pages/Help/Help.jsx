import React from 'react';
import './Help.css';

const Help = () => {
    return (
        <div className="container">
            <div className="card">
                <h1>Help Center</h1>
                <section className="faq-section">
                    <h3>How do daily challenges work?</h3>
                    [cite_start]<p>Every day at midnight, a new set of 10 questions is generated for your level[cite: 3].</p>
                    
                    <h3>How is my score calculated?</h3>
                    [cite_start]<p>Correct answers earn points based on difficulty: Easy (10), Medium (20), and Hard (30)[cite: 3].</p>
                </section>
                
                <section className="contact-support">
                    <p>Need more help? <a href="/feedback">Contact Support</a></p>
                </section>
            </div>
        </div>
    );
};

export default Help;