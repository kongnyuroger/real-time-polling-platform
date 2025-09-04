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


export default router 

