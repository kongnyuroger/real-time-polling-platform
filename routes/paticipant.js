import express from 'express'
import pool from '../config/db.js';

const router = express.Router()

//Checks if a session with the given code exists.
router.get('/sessions/:sessionCode', async (req, res) => {
    try {
        const { sessionCode } = req.params;

        const result = await pool.query(
            'SELECT id, session_code, name FROM sessions WHERE session_code = $1',
            [sessionCode]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = result.rows[0];
        
        return res.status(200).json({
            message: 'Session found',
            session: session
        });

    } catch (err) {
        console.error('Check session route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

//  Creates a new participant for a session.
router.post('/sessions/:sessionCode/join', async (req, res) => {
    try {
        const { sessionCode } = req.params;
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required.' });
        }

        
        const sessionResult = await pool.query(
            'SELECT id FROM sessions WHERE session_code = $1',
            [sessionCode]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found.' });
        }
        const sessionId = sessionResult.rows[0].id;
        
        
        const newParticipant = await pool.query(
            'INSERT INTO participants (session_id, name, email) VALUES ($1, $2, $3) RETURNING *',
            [sessionId, name, email]
        );
        
        return res.status(201).json({
            message: 'Successfully joined session',
            participant: newParticipant.rows[0]
        });

    } catch (err) {
        console.error('Join session route error:', err);
        
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'Email already used for this session.' });
        }
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

export default router;
