import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import authlimit from '../middleware/ratelimiting.js'
import authenticateToken from '../middleware/auth.js'

import 'dotenv/config'


const router = express()

//Register user

router.post('/register', authlimit, async function(req, res, next){
  try{ 
    const {name, password, email} = req.body;
    if (!name || !password || !email) {
        return res.status(400).json({ error: 'name and password and email required' });
    }
    const checkExist = await pool.query('SELECT * from hosts where email = $1',[email])
    if(password.length < 8){
        return res.status(400).json({ error: 'password must be at least 8 characters' });    
    }
    const hashPassword = await bcrypt.hash(password, 10)

    if(checkExist.rows.length === 0){
        
        const newUser = await pool.query(
      'INSERT INTO hosts (name, password_hash, email) VALUES ($1, $2, $3) RETURNING name, email ',
      [name, hashPassword, email]
    );
    return res.json({message: "successfuly registered", user: newUser.rows[0]})
    }
   
    return res.json({message: "user already exist"})
  }catch (err) {
    console.error('Register route error:', err);  
    return res.status(500).json({ error: 'internal server error' , message: err.message});
  }
})



//login
router.post('/login', authlimit, async (req, res) => {
  try{ 
    const {email, password} = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const checkExist = await pool.query('SELECT * from hosts where email = $1',[email])
    const host = checkExist.rows[0]
    if (!host) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const passwordOk = await bcrypt.compare(password, host.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign(
      { id: host.id, hostname: host.name , email: host.email},
      process.env.SECRET_KEY,
      { expiresIn: '1h' }
    );

    return res.json({ message: 'Login successful', token });
  } catch(err){
    console.error('login route error:', err);  
    return res.status(500).json({ error: 'internal server error' , message: err.message});
  }
});

//create session
//generate a random 6-character alphanumeric code
const generateSessionCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

router.post('/create-session', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Session name is required' });
        }

        const hostId = req.user.id;
        let sessionCode;
        let codeExists = true;

        // Loop to ensure the generated code is unique
        while (codeExists) {
            sessionCode = generateSessionCode();
            const result = await pool.query('SELECT 1 FROM sessions WHERE session_code = $1', [sessionCode]);
            if (result.rows.length === 0) {
                codeExists = false;
            }
        }

        const newSession = await pool.query(
            'INSERT INTO sessions (host_id, session_code, name) VALUES ($1, $2, $3) RETURNING *',
            [hostId, sessionCode, name]
        );

        return res.status(201).json({
            message: 'Session created successfully',
            session: newSession.rows[0]
        });

    } catch (err) {
        console.error('Create session route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

// GET all sessions for a logged-in host
router.get('/sessions', authenticateToken, async (req, res) => {
    try {
        const hostId = req.user.id;

        const sessions = await pool.query(
            'SELECT * FROM sessions WHERE host_id = $1 ORDER BY id DESC',
            [hostId]
        );

        return res.status(200).json({
            message: 'Sessions retrieved successfully',
            sessions: sessions.rows
        });
    } catch (err) {
        console.error('Get sessions route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});


// GET a specific session and its polls
router.get('/sessions/:sessionId', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const hostId = req.user.id;

        // Fetch the session and verify host ownership
        const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1 AND host_id = $2', [sessionId, hostId]);
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found or forbidden' });
        }
        const session = sessionResult.rows[0];

        // Fetch all polls for this session
        const pollsResult = await pool.query('SELECT * FROM polls WHERE session_id = $1 ORDER BY id ASC', [sessionId]);
        const polls = pollsResult.rows;

        // For each poll, fetch its options
        for (let poll of polls) {
            if (poll.type !== 'open-ended') {
                const optionsResult = await pool.query('SELECT * FROM poll_options WHERE poll_id = $1', [poll.id]);
                poll.options = optionsResult.rows;
            } else {
                poll.options = [];
            }
        }

        return res.status(200).json({
            message: 'Session and polls retrieved successfully',
            session: session,
            polls: polls
        });
    } catch (err) {
        console.error('Get single session route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});



// Create new poll for a session
router.post('/sessions/:sessionId/polls', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { question, type, options } = req.body;
        const hostId = req.user.id;

        if (!question || !type) {
            return res.status(400).json({ error: 'Question and type are required' });
        }
        
        if (type !== 'open-ended' && (!options || !Array.isArray(options) || options.length === 0)) {
            return res.status(400).json({ error: 'Options are required for non-open-ended polls' });
        }

        // Verify the host owns the session
        const sessionResult = await pool.query('SELECT host_id FROM sessions WHERE id = $1', [sessionId]);
        if (sessionResult.rows.length === 0 || sessionResult.rows[0].host_id !== hostId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this session' });
        }

        const newPoll = await pool.query(
            'INSERT INTO polls (session_id, question, status, type) VALUES ($1, $2, $3, $4) RETURNING *',
            [sessionId, question, 'draft', type]
        );
        const pollId = newPoll.rows[0].id;

        // Insert options if the poll is not open-ended
        const insertedOptions = [];
        if (type !== 'open-ended' && options.length > 0) {
            for (const optionText of options) {
                const newOption = await pool.query(
                    'INSERT INTO poll_options (poll_id, text) VALUES ($1, $2) RETURNING *',
                    [pollId, optionText]
                );
                insertedOptions.push(newOption.rows[0]);
            }
        }

        return res.status(201).json({
            message: 'Poll created successfully',
            poll: newPoll.rows[0],
            options: insertedOptions
        });
    } catch (err) {
        console.error('Create poll route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});



// Publish a poll
router.put('/polls/:pollId/publish', authenticateToken, async (req, res) => {
    try {
        const { pollId } = req.params;
        const hostId = req.user.id;

        const result = await pool.query(
            'UPDATE polls SET status = $1 WHERE id = $2 AND session_id IN (SELECT id FROM sessions WHERE host_id = $3) RETURNING *',
            ['published', pollId, hostId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Poll not found or forbidden' });
        }

        return res.status(200).json({
            message: 'Poll published successfully',
            poll: result.rows[0]
        });

    } catch (err) {
        console.error('Publish poll route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});



//colse poll
router.put('/polls/:pollId/close', authenticateToken, async (req, res) => {
    try {
        const { pollId } = req.params;
        const hostId = req.user.id;

        const result = await pool.query(
            'UPDATE polls SET status = $1 WHERE id = $2 AND session_id IN (SELECT id FROM sessions WHERE host_id = $3) RETURNING *',
            ['closed', pollId, hostId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Poll not found or forbidden' });
        }

        return res.status(200).json({
            message: 'Poll closed successfully',
            poll: result.rows[0]
        });

    } catch (err) {
        console.error('Close poll route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});



// Get poll results
router.get('/polls/:pollId/results', authMiddleware, async (req, res) => {
    try {
        const { pollId } = req.params;
        const hostId = req.user.id;

        // Verify that the poll exists and belongs to the authenticated host
        const pollResult = await pool.query(
            'SELECT * FROM polls WHERE id = $1 AND session_id IN (SELECT id FROM sessions WHERE host_id = $2)',
            [pollId, hostId]
        );
        if (pollResult.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found or forbidden' });
        }
        const poll = pollResult.rows[0];

        // Fetch all responses for the poll and join with the participants table
        const responsesResult = await pool.query(
            `SELECT 
                r.id AS response_id,
                r.response_data,
                p.name AS participant_name,
                p.email AS participant_email
            FROM responses r
            JOIN participants p ON r.participant_id = p.id
            WHERE r.poll_id = $1`,
            [pollId]
        );
        const responses = responsesResult.rows;

        // Fetch options for non-open-ended polls to provide context for results
        let options = [];
        if (poll.type !== 'open-ended') {
            const optionsResult = await pool.query('SELECT id, text FROM poll_options WHERE poll_id = $1', [pollId]);
            options = optionsResult.rows;
        }

        return res.status(200).json({
            message: 'Poll results retrieved successfully',
            poll: poll,
            options: options,
            responses: responses
        });
    } catch (err) {
        console.error('Get poll results route error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});




export default router 

