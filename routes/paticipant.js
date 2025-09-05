import express from 'express'
import pool from '../database/db.js'

const router = express.Router()

// GET /api/participant/sessions/:sessionCode: Checks if a session with the given code exists.
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

export default router;
