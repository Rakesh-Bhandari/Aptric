# 🚀 Aptric – AI-Powered Aptitude Learning Platform

> A modern, AI-powered aptitude preparation platform that combines adaptive learning, daily challenges, gamification, analytics, and intelligent question generation to help students improve their aptitude skills for placements, competitive exams, and technical interviews.

![Home Page](frontend/public/LOGO.png)

---

# 📖 Overview

**Aptric** is a full-stack web application designed to make aptitude preparation engaging, personalized, and data-driven. Unlike traditional aptitude platforms that rely on static question banks, Aptric leverages AI-powered question generation to continuously expand its database with high-quality, categorized aptitude questions.

The platform provides an interactive learning experience through:

- 🎯 Daily aptitude challenges
- 🤖 AI-generated questions
- 📊 Performance analytics
- 🏆 Gamified leaderboard
- 🔥 Daily streak system
- 📈 Progress tracking
- 👤 Personalized dashboard
- 🛠 Comprehensive admin panel

Aptric is built using **React**, **Node.js**, **Express**, **MySQL**, and **OpenRouter AI**, providing a scalable architecture suitable for educational platforms.

---

# ✨ Key Features

## 👨‍🎓 Student Features

- Secure Email & Google Authentication
- Daily Aptitude Challenges
- Practice Mode
- AI-Generated Questions
- Multiple Aptitude Categories
- Detailed Explanations
- Hint System
- Difficulty Levels
- Personalized Dashboard
- Daily Streak Tracking
- Performance Analytics
- Accuracy Statistics
- Activity Heatmap
- Leaderboard Rankings
- User Profile Management
- Theme Customization
- Feedback System

---

## 🛡 Admin Features

- Secure Admin Authentication
- Dashboard Analytics
- User Management
- Question Bank Management
- AI Bulk Question Generator
- Question Editing
- Question Deletion
- Create Users
- Promote Users
- Ban / Unban Users
- Reset Passwords
- Feedback Moderation
- Report Management
- Search, Filter & Sort Questions
- Audit Logs

---

# 🎯 Supported Categories

The platform currently supports six major aptitude domains.

- Quantitative Aptitude
- Logical Reasoning
- Verbal Ability
- Data Interpretation
- Puzzles
- Technical Aptitude

Each category contains questions classified into:

- Easy
- Medium
- Hard

---

# ⭐ Repository Highlights

- 🤖 AI-Powered Question Generation
- 📈 Gamified Learning Experience
- 🏆 Real-Time Leaderboard
- 📅 Daily Challenge System
- 📊 Advanced User Analytics
- 🔥 Daily Streak Tracking
- 📚 Dynamic Question Bank
- 👨‍💼 Complete Admin Dashboard
- 🔐 JWT + Google OAuth Authentication
- ☁ Cloud Image Uploads
- 📧 Email Verification Support
- 🌙 Dark Theme UI
- 📱 Responsive Design

---

# 🛠 Tech Stack

| Category | Technologies |
|-----------|--------------|
| Frontend | React, Vite, JavaScript, CSS3 |
| Backend | Node.js, Express.js |
| Database | MySQL (TiDB Compatible) |
| Authentication | JWT, Passport.js, Google OAuth |
| AI Integration | OpenRouter API |
| File Storage | Cloudinary |
| Email Service | Nodemailer |
| Scheduling | Node Cron |
| Deployment | Vercel |
| Version Control | Git & GitHub |

---

# 📂 Repository Structure

```text
.
├── backend
│   ├── database.sql
│   ├── src
│   │   ├── certs
│   │   ├── config
│   │   ├── middleware
│   │   ├── routes
│   │   ├── services
│   │   ├── utils
│   │   └── server.js
│   └── vercel.json
│
├── frontend
│   ├── public
│   │   └── LOGO.png
│   ├── src
│   │   ├── assets
│   │   ├── components
│   │   ├── context
│   │   ├── hooks
│   │   ├── pages
│   │   ├── utils
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vite.config.js
│
├── env.txt
├── package.json
└── README.md
```

---

# 🏗 System Architecture

```text
                    ┌──────────────────────┐
                    │      React UI        │
                    └──────────┬───────────┘
                               │
                      REST API Requests
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Express Backend    │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
 Authentication         AI Question Engine      Admin APIs
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                       MySQL Database
                               │
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
      Leaderboard        User Profiles      Question Bank
```

---

# ⚙ How It Works

## 1. User Authentication

Users can register using:

- Email & Password
- Google OAuth

After authentication, a secure session is created using JWT.

↓

## 2. Daily Challenge

Every day, users receive fresh aptitude questions generated from the question bank.

↓

## 3. AI Question Generation

Administrators can generate new aptitude questions using AI.

Questions are automatically categorized by:

- Category
- Difficulty
- Explanation
- Hint

↓

## 4. Practice Mode

Users solve questions from different categories while receiving:

- Instant feedback
- Correct explanations
- Performance statistics

↓

## 5. Progress Tracking

The system continuously records:

- Accuracy
- Score
- Daily streak
- Activity
- Level
- Ranking

↓

## 6. Leaderboard

Scores are updated dynamically, allowing users to compare their progress with others.

---

# 📋 Prerequisites

Before running the project, install:

- Node.js (18+)
- npm
- MySQL Server
- Git
- OpenRouter API Key
- Cloudinary Account
- Google OAuth Credentials

---

# ⚙ Installation

## 1. Clone Repository

```bash
git clone https://github.com/Rakesh-Bhandari/Aptric.git

cd Aptric
```

---

## 2. Install Root Dependencies

```bash
npm install
```

---

## 3. Install Backend Dependencies

```bash
cd backend

npm install
```

---

## 4. Install Frontend Dependencies

```bash
cd ../frontend

npm install
```

---

# 🔧 Environment Variables

Create a `.env` file inside the backend directory.

Configure the following variables.

```env
PORT=

JWT_SECRET=

DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

OPENROUTER_API_KEY=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

EMAIL_USER=
EMAIL_PASS=
```

---

# 🗄 Database Setup

Create a MySQL database.

Import the schema:

```bash
mysql -u root -p

CREATE DATABASE aptric;

USE aptric;

SOURCE database.sql;
```

---

# ▶ Running the Backend

```bash
cd backend

npm run dev
```

Backend runs on

```
http://localhost:5000
```

---

# ▶ Running the Frontend

Open another terminal.

```bash
cd frontend

npm run dev
```

Frontend runs on

```
http://localhost:5173
```

---

# 🌐 Deployment

The project is designed for deployment on **Vercel**.

Deploy:

- Frontend
- Backend

independently using the provided `vercel.json` configurations.

---

# 📊 User Dashboard

The personalized dashboard provides users with real-time insights into their learning journey.

### Dashboard Features

- 🏆 Current Rank
- 📈 Total Score
- 🎯 Accuracy Percentage
- 🔥 Daily Streak
- 📅 Activity Heatmap
- 📚 Solved Questions
- 📊 Skill Distribution
- 📉 Weekly Progress
- ⭐ Current Level
- 🎮 Performance Statistics

The dashboard enables users to identify strengths and weaknesses across different aptitude categories and monitor long-term improvement.

---

# 👨‍💼 Admin Dashboard

The Admin Dashboard provides centralized management of the entire platform.

### Dashboard Analytics

- Total Users
- Total Questions
- Total Feedback
- Pending Reports

### User Management

- Create Users
- Edit User Profiles
- Promote User Levels
- Ban / Unban Accounts
- Reset Passwords
- Delete Users
- View User Statistics

### Question Management

- View Complete Question Bank
- Search Questions
- Filter by Category
- Filter by Difficulty
- Edit Questions
- Delete Questions

### AI Bulk Generator

Administrators can generate hundreds of aptitude questions automatically using AI.

Generated questions include:

- Question Statement
- Four Options
- Correct Answer
- Difficulty
- Category
- Hint
- Detailed Explanation

### Feedback Moderation

- View User Feedback
- Delete Inappropriate Feedback
- Handle Reported Content

---

# 🤖 AI Question Generation

One of Aptric's core features is its AI-powered aptitude question generator.

Instead of manually writing every question, administrators can generate high-quality questions using AI.

The generated content includes:

- Question
- Four Options
- Correct Answer
- Explanation
- Hint
- Category
- Difficulty

This significantly reduces manual effort while continuously expanding the question bank.

---

# 🎮 Gamification System

To improve engagement, Aptric incorporates several gamification features.

### Daily Challenges

Users receive new aptitude questions every day.

### Daily Streak

Maintains consistency by rewarding users for continuous participation.

### Experience Points

Users earn points by:

- Solving Questions
- Maintaining Streaks
- Completing Daily Challenges

### Levels

Users progress through different skill levels based on accumulated scores.

### Leaderboard

Ranks users according to:

- Total Score
- Activity
- Performance

This encourages healthy competition among learners.

---

# 📁 REST API Modules

The backend follows a modular REST API architecture.

### Authentication

- User Registration
- Login
- Google OAuth
- Logout
- Password Reset

### User APIs

- User Profile
- Statistics
- Dashboard Data
- Activity History

### Question APIs

- Practice Questions
- Daily Questions
- AI Generated Questions
- Category Filtering

### Leaderboard APIs

- Global Rankings
- User Position
- Top Performers

### Feedback APIs

- Submit Feedback
- Report Feedback
- Delete Feedback

### Admin APIs

- User Management
- Question Management
- AI Generation
- Reports
- Dashboard Analytics

---

# 📊 Database Overview

The database stores all information required by the platform.

### Main Tables

- Users
- Questions
- User Progress
- Daily Questions
- Leaderboard
- Feedback
- Reports

The design ensures efficient retrieval of user progress, rankings, and AI-generated question data.

---

# 📸 Screenshots

## Landing Page

*Add landing page screenshot here*

---

## Login Page

*Add login page screenshot here*

---

## Dashboard

*Add dashboard screenshot here*

---

## Practice Page

*Add practice page screenshot here*

---

## Leaderboard

*Add leaderboard screenshot here*

---

## Profile

*Add profile screenshot here*

---

## Admin Dashboard

*Add admin dashboard screenshot here*

---

## AI Question Generator

*Add AI Generator screenshot here*

---

## User Management

*Add user management screenshot here*

---

## Question Management

*Add question management screenshot here*

---

## Feedback Management

*Add feedback management screenshot here*

---

# 📈 Performance Analytics

Aptric continuously evaluates user performance using several metrics.

### Metrics Tracked

- Total Questions Solved
- Accuracy Percentage
- Daily Activity
- Current Streak
- Total Score
- Skill-wise Performance
- Leaderboard Position

This enables users to make informed decisions about where to focus their preparation.

---

# 🎯 Applications

Aptric can be used for:

- Campus Placement Preparation
- Competitive Exam Practice
- Technical Interview Preparation
- Company Recruitment Training
- College Aptitude Tests
- Online Learning Platforms
- Coding Club Activities
- Student Skill Development

---

# 🚀 Future Improvements

The platform is designed to be extensible.

Planned enhancements include:

- 📱 Mobile Application
- 🔔 Push Notifications
- 🎤 Voice-based Questions
- 🎥 Video Explanations
- 🌍 Multi-language Support
- 📡 Real-time Multiplayer Quiz Battles
- 🧠 Personalized AI Learning Paths
- 📄 PDF Performance Reports
- 🏅 Achievement Badges
- 📅 Study Planner
- 📚 Mock Placement Tests
- 📊 Advanced Analytics Dashboard
- ☁ Cloud Synchronization
- 🤝 Friend Challenges
- 📢 Discussion Forums

---

# 📖 Project Summary

**Aptric** is a comprehensive AI-powered aptitude learning platform that combines modern web technologies, artificial intelligence, and gamification to provide an engaging and personalized learning experience.

The platform enables users to practice aptitude questions across multiple categories, monitor their performance through interactive dashboards, compete on leaderboards, and improve consistently using AI-generated content and detailed analytics.

Administrators benefit from a powerful management interface that supports AI-assisted question generation, user management, feedback moderation, and platform analytics.

By integrating **React**, **Node.js**, **Express**, **MySQL**, **OpenRouter AI**, **Google OAuth**, and **Cloudinary**, Aptric demonstrates a scalable full-stack architecture suitable for educational technology platforms and placement preparation systems.

---

## ⭐ If you found this project useful, consider giving it a star!
