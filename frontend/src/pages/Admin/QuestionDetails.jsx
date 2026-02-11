import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Admin.css'; // Uses existing admin styles

const QuestionDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    const [formData, setFormData] = useState({
        question_text: '',
        options: ['', '', '', ''],
        correct_answer_index: 0,
        difficulty: 'Medium',
        category: 'Quantitative Aptitude',
        hint: '',
        explanation: ''
    });

    const API_BASE_URL = 'http://localhost:5000';

    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}`, { credentials: 'include' });
                if (!res.ok) throw new Error('Question not found');
                
                const data = await res.json();
                
                // Handle options parsing safely
                let parsedOptions = [];
                try {
                    parsedOptions = typeof data.options === 'string' ? JSON.parse(data.options) : data.options;
                } catch (e) {
                    parsedOptions = ['', '', '', ''];
                }

                setFormData({
                    question_text: data.question_text || '',
                    options: Array.isArray(parsedOptions) && parsedOptions.length === 4 ? parsedOptions : ['', '', '', ''],
                    correct_answer_index: data.correct_answer_index ?? 0,
                    difficulty: data.difficulty || 'Medium',
                    category: data.category || 'Quantitative Aptitude',
                    hint: data.hint || '',
                    explanation: data.explanation || ''
                });
            } catch (err) {
                alert("Failed to load question.");
                navigate('/admin');
            } finally {
                setLoading(false);
            }
        };
        fetchQuestion();
    }, [id, navigate]);

    const handleOptionChange = (index, value) => {
        const newOptions = [...formData.options];
        newOptions[index] = value;
        setFormData({ ...formData, options: newOptions });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if(!window.confirm("Save changes?")) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData),
                credentials: 'include'
            });
            
            if(res.ok) {
                alert("Updated successfully!");
                navigate('/admin');
            } else {
                alert("Update failed.");
            }
        } catch(e) { console.error(e); }
    };

    const handleDelete = async () => {
        if(!window.confirm("Delete this question permanently?")) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/questions/${id}`, { method: 'DELETE', credentials: 'include' });
            if(res.ok) {
                alert("Deleted.");
                navigate('/admin');
            }
        } catch(e) { console.error(e); }
    };

    if (loading) return <div className="admin-container" style={{padding:'2rem'}}>Loading...</div>;

    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <button onClick={() => navigate('/admin')} className="admin-logout-btn" style={{marginBottom:'1rem', border:'none', textAlign:'left'}}>
                    ← Back to Admin
                </button>
            </aside>

            <main className="admin-content">
                <h2>Edit Question</h2>
                <div className="admin-table-container" style={{padding:'2rem'}}>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label>Question Text</label>
                            <textarea 
                                className="form-input" rows="3" required
                                value={formData.question_text} 
                                onChange={e => setFormData({...formData, question_text: e.target.value})} 
                            />
                        </div>

                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
                            <div className="form-group">
                                <label>Category</label>
                                <select className="form-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                    <option>Quantitative Aptitude</option>
                                    <option>Logical Reasoning</option>
                                    <option>Verbal Ability</option>
                                    <option>Data Interpretation</option>
                                    <option>Puzzles</option>
                                    <option>Technical Aptitude</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Difficulty</label>
                                <select className="form-input" value={formData.difficulty} onChange={e => setFormData({...formData, difficulty: e.target.value})}>
                                    <option>Easy</option>
                                    <option>Medium</option>
                                    <option>Hard</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Options</label>
                            <div style={{display:'grid', gap:'10px', gridTemplateColumns:'1fr 1fr'}}>
                                {formData.options.map((opt, idx) => (
                                    <input 
                                        key={idx} className="form-input" required
                                        placeholder={`Option ${String.fromCharCode(65+idx)}`}
                                        value={opt}
                                        onChange={e => handleOptionChange(idx, e.target.value)}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Correct Answer</label>
                            <select className="form-input" value={formData.correct_answer_index} onChange={e => setFormData({...formData, correct_answer_index: parseInt(e.target.value)})}>
                                {formData.options.map((opt, idx) => (
                                    <option key={idx} value={idx}>
                                        {String.fromCharCode(65+idx)}: {opt.substring(0, 40)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Explanation</label>
                            <textarea className="form-input" rows="3" value={formData.explanation} onChange={e => setFormData({...formData, explanation: e.target.value})} />
                        </div>

                        <div style={{display:'flex', gap:'1rem', marginTop:'2rem'}}>
                            <button type="submit" className="auth-button">Save Changes</button>
                            <button type="button" className="auth-button danger" style={{background:'var(--error)'}} onClick={handleDelete}>Delete</button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default QuestionDetails;