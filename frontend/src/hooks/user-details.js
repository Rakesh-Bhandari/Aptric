document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:5000';
    
    // --- DOM Elements ---
    const $ = (id) => document.getElementById(id);
    const elements = {
        detailsContainer: $('detailsContainer'),
        userName: $('userName'),
        userEmail: $('userEmail'),
        userId: $('userId'),
        userScore: $('userScore'),
        userLevel: $('userLevel'),
        userStreak: $('userStreak'),
        userBanned: $('userBanned'),
        userPassword: $('userPassword'),
        attemptsTableBody: $('attemptsTableBody'),
    };

    // --- API Helper ---
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            credentials: 'include', // Important for admin auth
            headers: {}
        };
        if (body) {
            options.body = JSON.stringify(body);
            options.headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (response.status === 401) {
                // Admin session expired or invalid
                document.body.innerHTML = '<h1>Admin session expired. Please log in again.</h1>';
                return null;
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'API request failed');
            }
            return await response.json();
        } catch (err) {
            console.error(`API Error on ${method} ${endpoint}:`, err);
            document.body.innerHTML = `<h1>Error: ${err.message}</h1>`;
            return null;
        }
    }

    // --- Render Functions ---
    function renderUserDetails(data) {
        if (!data || !data.user) {
            elements.userName.textContent = 'User Not Found';
            return;
        }
        
        const { user, attempts } = data;

        // User Header
        elements.userName.textContent = user.user_name;
        elements.userEmail.textContent = user.email;

        // Info Grid
        elements.userId.textContent = user.user_id;
        elements.userScore.textContent = user.score;
        elements.userLevel.textContent = user.level;
        elements.userStreak.textContent = user.day_streak;
        
        // Password Hash
        if (user.password_hash) {
            elements.userPassword.textContent = user.password_hash;
        } else {
            elements.userPassword.textContent = '(Google OAuth User)';
            elements.userPassword.classList.add('value-safe');
        }
        
        // Banned Status
        if (user.is_banned) {
            elements.userBanned.textContent = 'Banned';
            elements.userBanned.className = 'value banned';
        } else {
            elements.userBanned.textContent = 'Active';
            elements.userBanned.className = 'value safe';
        }

        // Attempts Table
        renderAttempts(attempts);
        
        // Show the content
        elements.detailsContainer.style.display = 'block';
    }

    function renderAttempts(attempts) {
        if (!attempts || attempts.length === 0) {
            elements.attemptsTableBody.innerHTML = '<tr><td colspan="5">No attempts found for this user.</td></tr>';
            return;
        }

        elements.attemptsTableBody.innerHTML = ''; // Clear loading
        
        attempts.forEach(a => {
            const tr = document.createElement('tr');
            
            let statusClass = '';
            if (a.status === 'correct') statusClass = 'safe';
            if (a.status === 'wrong' || a.status === 'gave_up') statusClass = 'banned'; // Re-use colors

            tr.innerHTML = `
                <td>${new Date(a.attempt_date).toLocaleDateString()}</td>
                <td>${a.qid}</td>
                <td>${a.question_text.substring(0, 70)}...</td>
                <td><span class="${statusClass}">${a.status}</span></td>
                <td>${a.points_earned}</td>
            `;
            elements.attemptsTableBody.appendChild(tr);
        });
    }

    // --- Initialization ---
    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('id');

        if (!userId) {
            document.body.innerHTML = '<h1>No User ID provided.</h1>';
            return;
        }

        const data = await apiRequest(`/api/admin/user-details/${userId}`);
        if (data) {
            renderUserDetails(data);
        }
    }

    initialize();
});