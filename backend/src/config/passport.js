import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { nanoid } from 'nanoid';
import dbPool from '../config/db.js';

export function configurePassport() {
    passport.use(new GoogleStrategy({
        clientID: process.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: process.env.VITE_GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.VITE_GOOGLE_REDIRECT_URI,
        proxy: true
    },
        async (accessToken, refreshToken, profile, done) => {
            const { id, displayName, emails } = profile;
            const email = emails[0].value;
            const now = new Date();

            try {
                const conn = await dbPool.getConnection();

                await conn.query(`
                    INSERT INTO users (user_id, google_id, user_name, email, last_login, level, answered_qids)
                    VALUES (?, ?, ?, ?, ?, 'Beginner', JSON_ARRAY())
                    ON DUPLICATE KEY UPDATE 
                        google_id = VALUES(google_id),
                        last_login = VALUES(last_login)
                `, [nanoid(12), id, displayName, email, now]);

                const [users] = await conn.query('SELECT * FROM users WHERE email = ?', [email]);
                conn.release();
                return done(null, users[0]);
            } catch (err) {
                console.error('Google Auth Error:', err);
                return done(err, null);
            }
        }
    ));

    passport.serializeUser((user, done) => done(null, user.user_id));

    passport.deserializeUser(async (id, done) => {
        try {
            const [users] = await dbPool.query('SELECT * FROM users WHERE user_id = ?', [id]);
            done(null, users[0]);
        } catch (err) {
            done(err, null);
        }
    });

    return passport;
}
