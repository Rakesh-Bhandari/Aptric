import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Progress.css';

const Progress = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState({ name: 'Loading...', email: 'Loading...' });
    const [stats, setStats] = useState({ streak: 0, questionsAnswered: 0, accuracy: 0, level: 'Beginner', score: 0 });
    const [topics, setTopics] = useState([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const API_BASE_URL = 'http://localhost:5000';

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                // Fetch basic user profile
                const userRes = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
                if (userRes.status === 401) return navigate('/'); 
                const userData = await userRes.json();
                setUser(userData.user);

                // Fetch detailed progress and topic stats
                const progressRes = await fetch(`${API_BASE_URL}/api/user/progress`, { credentials: 'include' });
                if (progressRes.ok) {
                    const progressData = await progressRes.json();
                    setStats(progressData.stats);
                    setTopics(progressData.topics);
                }
            } catch (err) {
                console.error("Error loading progress data:", err);
            }
        };
        fetchAllData();
    }, [navigate]);

    const handleLogout = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/logout`, { credentials: 'include' });
            if (response.ok) window.location.href = '/'; 
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/delete`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (response.ok) {
                alert('Your account has been successfully deleted.');
                window.location.href = '/';
            }
        } catch (err) {
            console.error("Delete account error:", err);
            setIsDeleting(false);
        }
    };

    return (
        <div className="container">
            {/* Profile Header */}
            <div className="profile-header">
                <div className="profile-avatar">
                    {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="profile-info">
                    <h1>{user.name}</h1>
                    <p>{user.email}</p>
                </div>
            </div>

            {/* Account Actions */}
            <div className="card account-actions">
                <h2>Account Actions</h2>
                <div className="action-buttons">
                    <button className="logout-btn" onClick={handleLogout}>
                        <span>🚪</span> Logout
                    </button>
                    <button className="delete-account-btn" onClick={() => setIsDeleteModalOpen(true)}>
                        <span>🗑️</span> Delete Account
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <p className="stat-value">{stats.streak}</p>
                    <p className="stat-label">Daily Streak (days)</p>
                </div>
                <div className="stat-card">
                    <p className="stat-value">{stats.questionsAnswered}</p>
                    <p className="stat-label">Questions Solved</p>
                </div>
                <div className="stat-card">
                    <p className="stat-value">{stats.accuracy}%</p>
                    <p className="stat-label">Accuracy</p>
                </div>
                <div className="stat-card">
                    <p className="stat-value">{stats.level}</p>
                    <p className="stat-label">Current Level</p>
                </div>
            </div>

            {/* Topic-wise Progress Bars */}
            <div className="card">
                <h2>Topic-wise Progress</h2>
                <div className="progress-bars">
                    {topics.map(topic => (
                        <div key={topic.name} className="progress-item">
                            <div className="topic-header">
                                <span className="topic-name">{topic.name}</span>
                                <span className="topic-percentage">{topic.progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill" 
                                    style={{ width: `${topic.progress}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="modal-overlay active">
                    <div className="confirmation-modal">
                        <button className="modal-close" onClick={() => setIsDeleteModalOpen(false)}>&times;</button>
                        <h2 className="modal-title">⚠️ Delete Account</h2>
                        <p className="modal-text">
                            Are you sure you want to delete your account? This action is permanent and cannot be undone. 
                        </p>
                        <div className="modal-buttons">
                            <button className="confirm-btn" onClick={handleDeleteAccount} disabled={isDeleting}>
                                {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                            </button>
                            <button className="cancel-btn" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Progress;