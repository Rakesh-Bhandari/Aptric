import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Admin.css';
import API_BASE_URL from '../../utils/config';

const Admin = () => {
    // 1. State Management
    const navigate = useNavigate();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [stats, setStats] = useState({ users: 0, questions: 0, feedback: 0, reports: 0 });

    // Data States
    const [users, setUsers] = useState([]);
    const [questions, setQuestions] = useState([]);
    const [allFeedback, setAllFeedback] = useState([]);
    const [feedbackReports, setFeedbackReports] = useState([]);

    // --- Bulk Generator State ---
    const [showGenModal, setShowGenModal] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [globalSubTopic, setGlobalSubTopic] = useState(''); // Suggested Feature
    
    // Matrix State: { "Logic": { Easy: 0, Medium: 0, Hard: 0 }, ... }
    const categoriesList = [
        "Quantitative Aptitude", "Logical Reasoning", 
        "Verbal Ability", "Data Interpretation", "Puzzles", "Technical Aptitude"
    ];
    
    const [genMatrix, setGenMatrix] = useState(
        categoriesList.reduce((acc, cat) => ({
            ...acc, 
            [cat]: { Easy: 0, Medium: 0, Hard: 0 }
        }), {})
    );

    // Create User Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });

    // --- NEW FILTER STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterDifficulty, setFilterDifficulty] = useState('All');
    const [sortOrder, setSortOrder] = useState('newest');

    // 2. Authentication Logic
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
                credentials: 'include'
            });
            if (response.ok) {
                setIsAuthenticated(true);
                loadDashboardStats();
            } else {
                setLoginError('Invalid master password.');
            }
        } catch (err) {
            setLoginError('Server connection failed.');
        }
    };

    // 3. Data Loading
    const loadDashboardStats = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/stats`, { credentials: 'include' });
            const data = await res.json();
            setStats({
                users: data.total_users,
                questions: data.total_questions,
                feedback: data.total_feedback,
                reports: data.pending_reports
            });
        } catch (err) { console.error("Failed to load stats", err); }
    };

    // Effect to load tab-specific data when activeTab changes
    useEffect(() => {
        if (isAuthenticated) {
            if (activeTab === 'users') loadUsers();
            if (activeTab === 'questions') loadQuestions();
            if (activeTab === 'feedback') loadAllFeedback();
            if (activeTab === 'reports') loadReports();
        }
    }, [activeTab, isAuthenticated]);

    const loadUsers = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users`, { credentials: 'include' });
            if (res.ok) setUsers(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadQuestions = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/questions`, { credentials: 'include' });
            if (res.ok) setQuestions(await res.json());
        } catch (e) { console.error(e); }
    };

    // --- NEW FILTER LOGIC ---
    const getFilteredQuestions = () => {
        let result = [...questions];

        // 1. Filter by Category
        if (filterCategory !== 'All') {
            result = result.filter(q => q.category === filterCategory);
        }
        // 2. Filter by Difficulty
        if (filterDifficulty !== 'All') {
            result = result.filter(q => q.difficulty === filterDifficulty);
        }
        // 3. Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(q =>
                q.question_text.toLowerCase().includes(term) ||
                (q.qid && q.qid.toLowerCase().includes(term))
            );
        }
        // 4. Sort
        if (sortOrder === 'newest') {
            result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else {
            result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
        return result;
    };

    const filteredQuestions = getFilteredQuestions();

    // --- MATRIX HANDLERS ---
    const handleMatrixChange = (category, difficulty, value) => {
        const val = parseInt(value) || 0;
        // Clamp to avoid huge numbers
        const safeVal = Math.min(Math.max(val, 0), 20); 
        
        setGenMatrix(prev => ({
            ...prev,
            [category]: { ...prev[category], [difficulty]: safeVal }
        }));
    };

    const getTotalToGenerate = () => {
        let total = 0;
        Object.values(genMatrix).forEach(diffs => {
            total += (diffs.Easy + diffs.Medium + diffs.Hard);
        });
        return total;
    };

    // --- Handler for Bulk Generation ---
    const handleBulkGenerate = async (e) => {
        e.preventDefault();
        const total = getTotalToGenerate();
        
        if (total === 0) return alert("Please select at least 1 question to generate.");
        if (total > 100) return alert("Max 100 questions per batch to avoid timeouts.");

        setIsGenerating(true);

        // 1. Convert Matrix to Job Array
        const jobs = [];
        Object.entries(genMatrix).forEach(([category, difficulties]) => {
            ['Easy', 'Medium', 'Hard'].forEach(diff => {
                if (difficulties[diff] > 0) {
                    jobs.push({
                        category,
                        difficulty: diff,
                        count: difficulties[diff],
                        subTopic: globalSubTopic // Pass the optional tag
                    });
                }
            });
        });

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/generate-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobs }),
                credentials: 'include'
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(data.message);
                setShowGenModal(false);
                // Reset Matrix
                setGenMatrix(categoriesList.reduce((acc, cat) => ({...acc, [cat]: { Easy: 0, Medium: 0, Hard: 0 }}), {}));
                if (activeTab === 'questions') loadQuestions();
            } else {
                alert(data.error || "Generation failed");
            }
        } catch (err) {
            console.error(err);
            alert("Server connection error");
        } finally {
            setIsGenerating(false);
        }
    };

    // Feedback

    const loadAllFeedback = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/feedback`, { credentials: 'include' });
            if (res.ok) setAllFeedback(await res.json());
        } catch (e) { console.error(e); }
    };

    const loadReports = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/feedback-reports`, { credentials: 'include' });
            if (res.ok) setFeedbackReports(await res.json());
        } catch (e) { console.error(e); }
    };

    // --- ACTIONS ---

    // Feedback Actions
    const handleDeleteFeedback = async (id) => {
        if (!window.confirm("Permanently delete this feedback?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/feedback/${id}`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) {
                alert("Feedback deleted");
                loadAllFeedback();
                loadReports(); // Reload reports too as they might reference this feedback
                loadDashboardStats();
            } else {
                alert("Failed to delete");
            }
        } catch (e) { console.error(e); }
    };

    // Question Actions
    const handleDeleteQuestion = async (id) => {
        if (!window.confirm("Delete this question? User history for this question will be preserved if possible, otherwise it might error.")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) {
                alert("Question deleted");
                loadQuestions();
                loadDashboardStats();
            } else {
                const data = await res.json();
                alert(data.error || "Failed to delete question");
            }
        } catch (e) { console.error(e); }
    };

    // Report Actions
    const handleDismissReport = async (reportId) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/reports/${reportId}/dismiss`, { method: 'POST', credentials: 'include' });
            if (res.ok) {
                loadReports();
                loadDashboardStats();
            } else {
                alert("Failed to dismiss report");
            }
        } catch (e) { console.error(e); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
                credentials: 'include'
            });
            if (res.ok) {
                alert("User created successfully");
                setShowCreateModal(false);
                loadUsers();
                setNewUser({ name: '', email: '', password: '', role: 'user' });
            } else {
                alert("Failed to create user");
            }
        } catch (e) { console.error(e); }
    };

    if (!isAuthenticated) {
        return (
            <div className="admin-login-overlay">
                <div className="admin-login-box">
                    <h2>Admin Login</h2>
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label>Password</label>
                            <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        {loginError && <div className="form-message error">{loginError}</div>}
                        <button type="submit" className="auth-button">Login</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <div className="sidebar-menu">
                    {['dashboard', 'users', 'questions', 'feedback', 'reports'].map((tab) => (
                        <a key={tab} href={`#${tab}`} className={`admin-tab-link ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            {tab === 'reports' && stats.reports > 0 && <span className="admin-pill">{stats.reports}</span>}
                        </a>
                    ))}
                </div>
                <button onClick={() => setIsAuthenticated(false)} className="admin-logout-btn">Logout</button>
            </aside>

            {/* Main Content Area */}
            <main className="admin-content">

                {/* --- DASHBOARD --- */}
                {activeTab === 'dashboard' && (
                    <section className="admin-tab-content active">
                        <h2>Dashboard</h2>
                        <div className="admin-stats-grid">
                            <StatCard value={stats.users} label="Total Users" />
                            <StatCard value={stats.questions} label="Total Questions" />
                            <StatCard value={stats.feedback} label="Total Feedback" />
                            <StatCard value={stats.reports} label="Pending Reports" isDanger />
                        </div>
                    </section>
                )}

                {/* --- USERS --- */}
                {activeTab === 'users' && (
                    <section className="admin-tab-content active">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2>User Management</h2>
                            <button className="auth-button" onClick={() => setShowCreateModal(true)}>+ Create User</button>
                        </div>

                        <div className="admin-table-container">
                            <table className="admin-table">
                                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.user_id}>
                                            <td>{user.user_name}</td>
                                            <td>{user.email}</td>
                                            <td><span className={`level-tag ${user.role}`}>{user.role || 'user'}</span></td>
                                            <td>{user.is_banned ? <span className="status-banned">Banned</span> : 'Active'}</td>
                                            <td>
                                                <button
                                                    className="admin-action-btn view"
                                                    onClick={() => navigate(`/admin/user/${user.user_id}`)}
                                                >
                                                    Manage
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* --- QUESTIONS TAB --- */}
                {activeTab === 'questions' && (
                    <section className="admin-tab-content active">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2>Question Bank</h2>
                            {/* NEW GENERATE BUTTON */}
                            <button
                                className="auth-button"
                                style={{ backgroundColor: '#8b5cf6' }} // Purple color to distinguish
                                onClick={() => setShowGenModal(true)}
                            >
                                ✨ AI Generator
                            </button>
                        </div>

                        {/* CONTROL BAR */}
                        <div style={{
                            background: 'var(--card-bg)',
                            padding: '1rem',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            gap: '10px',
                            flexWrap: 'wrap',
                            alignItems: 'center'
                        }}>
                            <input
                                className="form-input"
                                placeholder="Search text..."
                                style={{ width: '200px', margin: 0 }}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />

                            <select className="form-input" style={{ width: '150px', margin: 0 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                                <option value="All">All Categories</option>
                                <option>Quantitative Aptitude</option>
                                <option>Logical Reasoning</option>
                                <option>Verbal Ability</option>
                                <option>Data Interpretation</option>
                                <option>Puzzles</option>
                                <option>Technical Aptitude</option>
                            </select>

                            <select className="form-input" style={{ width: '120px', margin: 0 }} value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)}>
                                <option value="All">All Levels</option>
                                <option>Easy</option>
                                <option>Medium</option>
                                <option>Hard</option>
                            </select>

                            <select className="form-input" style={{ width: '120px', margin: 0 }} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                                <option value="newest">Newest</option>
                                <option value="oldest">Oldest</option>
                            </select>

                            {/* COUNTER */}
                            <div style={{ marginLeft: 'auto', fontWeight: '600', color: 'var(--text-muted)' }}>
                                {filteredQuestions.length} / {questions.length} Total
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="admin-table-container">
                            <table className="admin-table">
                                <thead><tr><th>QID</th><th>Text</th><th>Difficulty</th><th>Category</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {filteredQuestions.length === 0 ? (
                                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No questions match your filters.</td></tr>
                                    ) : (
                                        filteredQuestions.map(q => (
                                            <tr key={q.question_id}>
                                                <td><small>{q.qid}</small></td>
                                                <td title={q.question_text}>
                                                    {q.question_text.length > 50 ? q.question_text.substring(0, 50) + '...' : q.question_text}
                                                </td>
                                                <td><span className={`level-tag ${q.difficulty.toLowerCase()}`}>{q.difficulty}</span></td>
                                                <td>{q.category}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <button
                                                            className="admin-action-btn view"
                                                            onClick={() => navigate(`/admin/question/${q.question_id}`)}
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* --- FEEDBACK --- */}
                {activeTab === 'feedback' && (
                    <section className="admin-tab-content active">
                        <h2>All Feedback</h2>
                        <div className="admin-table-container">
                            <table className="admin-table">
                                <thead><tr><th>User</th><th>Rating</th><th>Comment</th><th>Date</th><th>Action</th></tr></thead>
                                <tbody>
                                    {allFeedback.map(item => (
                                        <tr key={item.feedback_id}>
                                            <td>{item.user_name}</td>
                                            <td>{item.rating} ★</td>
                                            <td>{item.comment}</td>
                                            <td>{new Date(item.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button
                                                    className="admin-action-btn delete"
                                                    style={{ color: 'var(--error)', background: 'none', border: '1px solid var(--error)' }}
                                                    onClick={() => handleDeleteFeedback(item.feedback_id)}
                                                >Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* --- REPORTS (NEW) --- */}
                {activeTab === 'reports' && (
                    <section className="admin-tab-content active">
                        <h2>Feedback Reports</h2>
                        <div className="admin-table-container">
                            <table className="admin-table">
                                <thead><tr><th>Reporter</th><th>Feedback Author</th><th>Content</th><th>Action</th></tr></thead>
                                <tbody>
                                    {feedbackReports.map(rep => (
                                        <tr key={rep.report_id}>
                                            <td>{rep.reporter_name}</td>
                                            <td>{rep.author_name}</td>
                                            <td>
                                                <div style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>Rating: {rep.rating}★</div>
                                                <div>{rep.comment}</div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button
                                                        className="admin-action-btn"
                                                        onClick={() => handleDismissReport(rep.report_id)}
                                                    >Dismiss</button>
                                                    <button
                                                        className="admin-action-btn delete"
                                                        style={{ color: 'var(--error)', border: '1px solid var(--error)' }}
                                                        onClick={() => handleDeleteFeedback(rep.feedback_id)}
                                                    >Delete Post</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {feedbackReports.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center' }}>No pending reports.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

            </main>

            {/* --- IMPROVED BULK GENERATOR MODAL --- */}
            {showGenModal && (
                <div className="admin-login-overlay">
                    <div className="admin-login-box modal-wide">
                        
                        {/* 1. Header (Fixed at top) */}
                        <div className="modal-header">
                            <h2>AI Question Generator</h2>
                            <p>Distribute questions across categories. Max 100 per batch.</p>
                            <button onClick={() => setShowGenModal(false)} className="close-modal-btn">×</button>
                        </div>
                        
                        {/* 2. Scrollable Body */}
                        <div className="modal-body">
                            <form id="bulk-gen-form" onSubmit={handleBulkGenerate}>
                                {/* Sub-Topic Input */}
                                <div className="form-group" style={{textAlign: 'left'}}>
                                    <label style={{fontWeight:'600', color:'var(--primary)', display:'block', marginBottom:'0.5rem'}}>
                                        Sub-Topic Focus <span style={{fontWeight:'400', color:'var(--text-muted)'}}>(Optional)</span>
                                    </label>
                                    <input 
                                        className="form-input" 
                                        placeholder="e.g. 'Time and Work', 'Blood Relations'..."
                                        value={globalSubTopic}
                                        onChange={e => setGlobalSubTopic(e.target.value)}
                                        style={{background:'rgba(255,255,255,0.03)'}}
                                    />
                                </div>

                                {/* Matrix Table */}
                                <div className="matrix-scroll-container">
                                    <table className="matrix-table">
                                        <thead>
                                            <tr>
                                                <th>Category</th>
                                                <th style={{color:'#4ade80'}}>Easy</th>
                                                <th style={{color:'#fbbf24'}}>Medium</th>
                                                <th style={{color:'#f87171'}}>Hard</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoriesList.map(cat => (
                                                <tr key={cat}>
                                                    <td>{cat}</td>
                                                    <td>
                                                        <input 
                                                            type="number" min="0" max="20" 
                                                            className="matrix-input" 
                                                            value={genMatrix[cat].Easy === 0 ? '' : genMatrix[cat].Easy}
                                                            onChange={e => handleMatrixChange(cat, 'Easy', e.target.value)}
                                                            placeholder="-"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input 
                                                            type="number" min="0" max="20" 
                                                            className="matrix-input" 
                                                            value={genMatrix[cat].Medium === 0 ? '' : genMatrix[cat].Medium}
                                                            onChange={e => handleMatrixChange(cat, 'Medium', e.target.value)}
                                                            placeholder="-"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input 
                                                            type="number" min="0" max="20" 
                                                            className="matrix-input" 
                                                            value={genMatrix[cat].Hard === 0 ? '' : genMatrix[cat].Hard}
                                                            onChange={e => handleMatrixChange(cat, 'Hard', e.target.value)}
                                                            placeholder="-"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </form>
                        </div>

                        {/* 3. Footer (Fixed at bottom) */}
                        <div className="modal-footer">
                            <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
                                <span style={{color:'var(--text-muted)', fontSize:'0.9rem', fontWeight:'600'}}>TOTAL QUESTIONS:</span>
                                <span className="total-badge">{getTotalToGenerate()}</span>
                            </div>
                            
                            <div style={{display:'flex', gap:'10px'}}>
                                <button 
                                    type="button" 
                                    className="admin-logout-btn" 
                                    onClick={() => setShowGenModal(false)} 
                                    disabled={isGenerating}
                                    style={{border:'1px solid var(--border)', padding:'0.6rem 1.2rem'}}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    form="bulk-gen-form" /* Connects to form in body */
                                    className="auth-button" 
                                    disabled={isGenerating || getTotalToGenerate() === 0}
                                    style={{
                                        display:'flex', alignItems:'center', gap:'10px', 
                                        padding:'0.6rem 1.5rem', fontSize:'1rem'
                                    }}
                                >
                                    {isGenerating ? (
                                        <>
                                            <span className="loader-spin"></span>
                                            <span>Generating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>Generate Batch</span>
                                            <span>→</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
            
            {/* Create User Modal */}
            {showCreateModal && (
                <div className="admin-login-overlay">
                    <div className="admin-login-box">
                        <h3>Create New User</h3>
                        <form onSubmit={handleCreateUser}>
                            <input className="form-input" placeholder="Name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
                            <input className="form-input" placeholder="Email" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
                            <input className="form-input" placeholder="Password" type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
                            <select className="form-input" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                <option value="user">User</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                            </select>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '10px' }}>
                                <button type="submit" className="auth-button">Create</button>
                                <button type="button" className="admin-logout-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ value, label }) => (<div className="admin-stat-card"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>);

export default Admin;