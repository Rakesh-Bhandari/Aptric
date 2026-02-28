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
            const email = emails?.[0]?.value;

            if (!email) {
                return done(new Error('No email found in Google profile'), null);
            }

            const now = new Date();
            let conn;

            try {
                conn = await dbPool.getConnection();

                await conn.query(`
                    INSERT INTO users (user_id, google_id, user_name, email, last_login, level, answered_qids)
                    VALUES (?, ?, ?, ?, ?, 'Beginner', JSON_ARRAY())
                    ON DUPLICATE KEY UPDATE 
                        google_id = VALUES(google_id),
                        last_login = VALUES(last_login)
                `, [nanoid(12), id, displayName, email, now]);

                const [users] = await conn.query('SELECT * FROM users WHERE email = ?', [email]);

                if (!users || users.length === 0) {
                    return done(new Error('User not found after upsert'), null);
                }

                if (users[0].is_banned) {
                    return done(null, false, { message: 'Account suspended.' });
                }

                return done(null, users[0]);
            } catch (err) {
                console.error('[Passport] Google Auth DB Error:', err.message);
                return done(err, null);
            } finally {
                if (conn) {
                    try { conn.release(); } catch (_) {}
                }
            }
        }
    ));

    // Store only user_id in session — minimal session footprint
    passport.serializeUser((user, done) => {
        if (!user || !user.user_id) {
            return done(new Error('Invalid user object during serialization'), null);
        }
        done(null, user.user_id);
    });

    // Safely deserialize — never crash the server if DB is down or user missing
    passport.deserializeUser(async (id, done) => {
        if (!id) return done(null, false);

        try {
            const [users] = await dbPool.query(
                'SELECT * FROM users WHERE user_id = ?',
                [id]
            );

            if (!users || users.length === 0) {
                // User was deleted — clear their session gracefully
                console.warn(`[Passport] Deserialize: user ${id} not found, clearing session.`);
                return done(null, false);
            }

            if (users[0].is_banned) {
                // Banned mid-session — clear gracefully
                console.warn(`[Passport] Deserialize: user ${id} is banned, clearing session.`);
                return done(null, false);
            }

            return done(null, users[0]);
        } catch (err) {
            // DB is down or query failed — log but don't crash
            // Returning false clears the session; returning err would crash
            console.error('[Passport] Deserialize DB error:', err.message);

            // If it's a connection error, pass false (unauthenticated) instead of crashing
            if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_CON_COUNT_ERROR') {
                console.error('[Passport] DB connection issue — treating session as unauthenticated.');
                return done(null, false);
            }

            return done(err, false);
        }
    });

    return passport;
}