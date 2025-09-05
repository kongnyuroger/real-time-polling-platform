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


// Retrieves all published polls for that session.
router.get('/sessions/:sessionCode/polls', async (req, res) => {
    try {
        const { sessionCode } = req.params;
        
        const sessionResult = await pool.query(
            'SELECT id FROM sessions WHERE session_code = $1',
            [sessionCode]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found.' });
        }
        const sessionId = sessionResult.rows[0].id;

        
        const pollsResult = await pool.query(
            'SELECT id, question, type FROM polls WHERE session_id = $1 AND status = $2',
            [sessionId, 'published']
        );
        
        const polls = pollsResult.rows;

        
        for (const poll of polls) {
            if (poll.type === 'single-choice' || poll.type === 'multiple-choice') {
                const optionsResult = await pool.query(
                    'SELECT id, text FROM poll_options WHERE poll_id = $1',
                    [poll.id]
                );
                poll.options = optionsResult.rows;
            }
        }
        
        return res.status(200).json({
            message: 'Published polls retrieved successfully',
            polls: polls
        });

    } catch (err) {
        console.error('Get published polls route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

// POST /api/participant/polls/:pollId/submit: Stores a response for a specific poll.
router.post('/polls/:pollId/submit', async (req, res) => {
    try {
        const { pollId } = req.params;
        const { participantId, responseData } = req.body;
        
        if (!participantId || !responseData) {
            return res.status(400).json({ error: 'Participant ID and response data are required.' });
        }
        
        // Check if poll exists and is published
        const pollResult = await pool.query(
            'SELECT id FROM polls WHERE id = $1 AND status = $2',
            [pollId, 'published']
        );

        if (pollResult.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found or not currently accepting responses.' });
        }

        // Insert the new response
        const newResponse = await pool.query(
            'INSERT INTO responses (poll_id, participant_id, response_data) VALUES ($1, $2, $3) RETURNING *',
            [pollId, participantId, responseData]
        );
        
        return res.status(201).json({
            message: 'Response submitted successfully',
            response: newResponse.rows[0]
        });

    } catch (err) {
        console.error('Submit response route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});


export default router;
