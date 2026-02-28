import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Admin.css'; // Uses the same styles as Admin dashboard
import API_BASE_URL from '../../utils/config';

const UserDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    
    // Edit Form State
    const [formData, setFormData] = useState({ user_name: '', email: '', role: 'user' });
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        fetchUserDetails();
    }, [id]);

    const fetchUserDetails = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('User not found');
            
            const data = await res.json();
            setUser(data);
            
            // Initialize form data safely
            setFormData({ 
                user_name: data.user_name || '', 
                email: data.email || '', 
                role: data.role || 'user' 
            });
        } catch (err) {
            console.error("Error loading user:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        if(!window.confirm("Save changes?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData),
                credentials: 'include'
            });
            if(res.ok) {
                alert("Profile updated");
                fetchUserDetails();
            }
        } catch(e) { alert("Update failed"); }
    };

    // --- PROMOTE ACTION ---
    const handlePromoteUser = async () => {
        if(!window.confirm(`Promote ${user.user_name} to the next level? \nThis will strictly boost their score to meet the minimum requirement.`)) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}/promote`, {
                method: 'POST',
                credentials: 'include'
            });
            const data = await res.json();
            
            if(res.ok) {
                alert(data.message);
                fetchUserDetails(); // Refresh to see new level
            } else {
                alert(data.error || "Promotion failed");
            }
        } catch(e) { alert("Network error during promotion"); }
    };

    const handleBanToggle = async () => {
        if (!user) return;
        const newState = !user.is_banned;
        if(!window.confirm(newState ? "Ban this user?" : "Unban this user?")) return;
        try {
            await fetch(`${API_BASE_URL}/api/admin/users/${id}/ban-toggle`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ is_banned: newState }),
                credentials: 'include'
            });
            fetchUserDetails();
        } catch(e) { console.error(e); }
    };

    const handleResetPassword = async () => {
        if(!newPassword) return alert("Enter a new password");
        if(!window.confirm("Reset user password?")) return;
        try {
            await fetch(`${API_BASE_URL}/api/admin/users/${id}/reset-password`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ newPassword }),
                credentials: 'include'
            });
            alert("Password reset successfully");
            setNewPassword('');
        } catch(e) { alert("Failed to reset password"); }
    };

    const handleDeleteUser = async () => {
        if(!window.confirm("⚠ WARNING: This will permanently delete the user and all their data. Continue?")) return;
        try {
            await fetch(`${API_BASE_URL}/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
            alert("User deleted");
            navigate('/admin');
        } catch(e) { alert("Delete failed"); }
    };

    if (loading) return <div className="admin-container" style={{padding:'2rem'}}>Loading user profile...</div>;
    
    if (!user) return (
        <div className="admin-container" style={{padding:'2rem'}}>
            <h2>User not found</h2>
            <button onClick={() => navigate('/admin')} className="admin-logout-btn" style={{color:'var(--primary)', borderColor:'var(--primary)', marginTop:'1rem'}}>
                Return to Admin Panel
            </button>
        </div>
    );

    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <button onClick={() => navigate('/admin')} className="admin-logout-btn" style={{marginBottom:'1rem', border:'none', textAlign:'left'}}>
                    ← Back to Admin
                </button>
                <div className="sidebar-menu">
                    <button className={`admin-tab-link ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                    <button className={`admin-tab-link ${activeTab === 'edit' ? 'active' : ''}`} onClick={() => setActiveTab('edit')}>Edit Properties</button>
                    <button className={`admin-tab-link ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security & Password</button>
                    <button className={`admin-tab-link ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Audit Logs</button>
                    <button className={`admin-tab-link ${activeTab === 'danger' ? 'active' : ''}`} onClick={() => setActiveTab('danger')} style={{color:'var(--error)'}}>Danger Zone</button>
                </div>
            </aside>

            <main className="admin-content">
                {/* --- HEADER SECTION --- */}
                <div className="user-header-card" style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <div>
                            <h1 style={{margin:0, fontSize:'2rem'}}>{user.user_name}</h1>
                            <div className="badges" style={{display:'flex', gap:'10px', margin:'10px 0', alignItems:'center'}}>
                                <span className={`level-tag ${user.role}`}>{user.role?.toUpperCase() || 'USER'}</span>
                                <span className={`admin-pill`} style={{backgroundColor: user.is_banned ? 'var(--error)' : 'var(--success)'}}>
                                    {user.is_banned ? 'BANNED' : 'ACTIVE'}
                                </span>
                                <span className="level-tag" style={{background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize:'0.9rem', padding:'4px 10px'}}>
                                    LEVEL: {user.level}
                                </span>
                            </div>
                            <p className="stat-label">ID: {user.user_id} | Joined: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                        </div>

                        {/* --- PROMOTE BUTTON (Always Visible) --- */}
                        {user.level !== 'Expert' && (
                            <button 
                                onClick={handlePromoteUser}
                                className="auth-button"
                                style={{
                                    width: 'auto', 
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                                    padding: '0.6rem 1.2rem',
                                    fontSize: '0.9rem'
                                }}
                            >
                                ⬆ Promote User
                            </button>
                        )}
                    </div>
                </div>

                {activeTab === 'overview' && (
                    <div className="admin-stats-grid">
                        <div className="admin-stat-card"><div className="stat-value">{user.score.toLocaleString()}</div><div className="stat-label">Total Score</div></div>
                        <div className="admin-stat-card"><div className="stat-value">{user.level || 'Beginner'}</div><div className="stat-label">Level</div></div>
                        <div className="admin-stat-card"><div className="stat-value">{user.day_streak || 0}</div><div className="stat-label">Day Streak</div></div>
                        <div className="admin-stat-card"><div className="stat-value">{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</div><div className="stat-label">Last Login</div></div>
                    </div>
                )}

                {activeTab === 'edit' && (
                    <div className="admin-table-container" style={{padding:'2rem'}}>
                        <h2>Edit User Properties</h2>
                        <form onSubmit={handleUpdateProfile}>
                            <div style={{marginBottom: '1rem'}}>
                                <label className="stat-label">Full Name</label>
                                <input className="form-input" value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} />
                            </div>
                            <div style={{marginBottom: '1rem'}}>
                                <label className="stat-label">Email Address</label>
                                <input className="form-input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div style={{marginBottom: '1rem'}}>
                                <label className="stat-label">Role & Permissions</label>
                                <select className="form-input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                    <option value="user">User (Standard)</option>
                                    <option value="editor">Editor (Content Manager)</option>
                                    <option value="admin">Admin (Full Access)</option>
                                </select>
                            </div>
                            <button type="submit" className="auth-button" style={{marginTop:'1rem'}}>Save Changes</button>
                        </form>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className="admin-table-container" style={{padding:'2rem'}}>
                        <h2>Password Management</h2>
                        <div style={{marginBottom: '1rem'}}>
                            <label className="stat-label">Set New Password</label>
                            <input className="form-input" type="password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                            <button className="auth-button" onClick={handleResetPassword} style={{marginTop:'10px'}}>Reset Password</button>
                        </div>
                        <hr style={{borderColor:'var(--border)', margin:'2rem 0'}} />
                        <h2>Account Status</h2>
                        <p className="stat-label">Controls whether the user can log in.</p>
                        <button className="auth-button" style={{backgroundColor: user.is_banned ? 'var(--success)' : 'var(--error)', marginTop: '10px'}} onClick={handleBanToggle}>
                            {user.is_banned ? "Unban User" : "Ban User"}
                        </button>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="admin-table-container">
                        <table className="admin-table">
                            <thead><tr><th>Action</th><th>Details</th><th>Date</th></tr></thead>
                            <tbody>
                                {user.logs && user.logs.length > 0 ? user.logs.map(log => (
                                    <tr key={log.log_id}>
                                        <td>{log.action}</td>
                                        <td>{log.details}</td>
                                        <td>{new Date(log.created_at).toLocaleString()}</td>
                                    </tr>
                                )) : <tr><td colSpan="3" style={{textAlign:'center', padding:'2rem'}}>No activity logs found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'danger' && (
                    <div className="admin-table-container" style={{padding:'2rem', borderColor:'var(--error)', border:'1px solid var(--error)'}}>
                        <h2 style={{color:'var(--error)'}}>Danger Zone</h2>
                        <p style={{color: 'var(--text-muted)'}}>Once you delete a user, there is no going back. Please be certain.</p>
                        <button className="admin-logout-btn" onClick={handleDeleteUser} style={{marginTop:'1rem', borderColor:'var(--error)', color:'var(--error)', width:'auto'}}>
                            Permanently Delete User
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default UserDetails;