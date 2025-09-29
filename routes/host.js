import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import auth from '../middleware/auth.js'
import authlimit from '../middleware/ratelimiting.js'
import { loginValidation, registerValidation } from '../middleware/regValidation.js'
import { validationResult } from 'express-validator'
import dotenv from 'dotenv';


import 'dotenv/config'
dotenv.config();
const router = express()

//Register user
router.post('/register', registerValidation, async function(req, res, next){
  try{ 
    const {name, password, email} = req.body;
     const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const emailNormalized = email.toLowerCase();
    const checkExist = await pool.query(
      'SELECT * from hosts where email ILIKE $1',[emailNormalized]
    )
    
    const hashPassword = await bcrypt.hash(password, 10)

    if(checkExist.rows.length === 0){
        
        const newUser = await pool.query(
      'INSERT INTO hosts (name, password_hash, email) VALUES ($1, $2, $3) RETURNING name, email',
      [name, hashPassword, email]
    );
    return res.json({message: "successfuly registered", newUser: newUser.rows[0]})
    }
   
    return res.json({message: "user already exist"})
  }catch (err) {
    console.error('Register route error:', err);  
    return res.status(500).json({ error: 'internal server error' , message: err.message});
  }
})

//login
router.post('/login', authlimit, loginValidation, async (req, res) => {
  try{ 
    const {email, password} = req.body;
    const errors = validationResult(req)
    if(!errors.isEmpty()){
        return res.status(400).json({ errors: errors.array() });

    }
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const emailNormalized = email.toLowerCase();
    const checkExist = await pool.query(
      'SELECT * from hosts where email ILIKE $1',[emailNormalized]
    )
    if (checkExist.rows.length === 0) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = checkExist.rows[0]
    const passwordOk = await bcrypt.compare(password, user.password_hash);
   
    if (!passwordOk) {
      return res.status(401).json({ error: 'wrong Password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.name , email: user.email},
      process.env.SECRET_KEY,
      { expiresIn: process.env.TOKEN_LENGTH }
    );

    return res.json({ message: 'Login successful', token });
  } catch(err){
    console.error('login route error:', err);  
    return res.status(500).json({ error: 'internal server error' , message: err.message});
  }
});

//create session
router.post('/sessions', auth, async (req, res) => {
  try {
    const { name } = req.body;
    const hostId = req.user.id;
    if (!name) {
      return res.status(400).json({ error: 'Session name is required' });
    }
    
    // Generate a unique session code
    const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newSession = await pool.query(
      'INSERT INTO sessions (host_id, name, session_code) VALUES ($1, $2, $3) RETURNING id, name, session_code',
      [hostId, name, sessionCode]
    );
    
    res.status(201).json({
      message: 'Session created successfully',
      session: newSession.rows[0]
    });

  } catch (err) {
    console.error('Create session route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// GET all sessions for a host
router.get('/sessions', auth, async (req, res) => {
  try {
    const hostId = req.user.id;
    const sessions = await pool.query(
      'SELECT id, name, session_code FROM sessions WHERE host_id = $1',
      [hostId]
    );
    res.json({ sessions: sessions.rows });
  } catch (err) {
    console.error('Get sessions route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// GET a specific session and its polls
router.get('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const hostId = req.user.id;

    // First, verify the host owns the session
    const session = await pool.query(
      'SELECT id, name, session_code FROM sessions WHERE id = $1 AND host_id = $2',
      [sessionId, hostId]
    );
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or not authorized' });
    }

    // Then, get all polls for that session
    const polls = await pool.query(
      'SELECT id, question, status, type FROM polls WHERE session_id = $1 ORDER BY id',
      [sessionId]
    );
    
    res.json({ session: session.rows[0], polls: polls.rows });

  } catch (err) {
    console.error('Get specific session route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});


//Create poll
router.post('/sessions/:sessionId/polls', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { question, type, options } = req.body;
    const hostId = req.user.id;

    if (!question || !type) {
      return res.status(400).json({ error: 'Question and type are required' });
    }

    // Verify the session belongs to the host
    const sessionCheck = await pool.query('SELECT id FROM sessions WHERE id = $1 AND host_id = $2', [sessionId, hostId]);
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or not authorized' });
    }

    const newPoll = await pool.query(
      'INSERT INTO polls (session_id, question, status, type) VALUES ($1, $2, $3, $4) RETURNING id, question, status, type',
      [sessionId, question, 'draft', type]
    );

    const pollId = newPoll.rows[0].id;
    
    if (options && (type === 'single-choice' || type === 'multiple-choice')) {
      const optionPromises = options.map(optionText =>
        pool.query('INSERT INTO poll_options (poll_id, text) VALUES ($1, $2)', [pollId, optionText])
      );
      await Promise.all(optionPromises);
    }

    res.status(201).json({
      message: 'Poll created successfully',
      poll: newPoll.rows[0]
    });

  } catch (err) {
    console.error('Create poll route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// PUT /api/host/polls/:pollId/publish
router.put('/polls/:pollId/publish', auth, async (req, res) => {
  try {
    const { pollId } = req.params;
    const hostId = req.user.id;

    // Verify the host owns the poll's session
    const checkPoll = await pool.query(
      'SELECT p.session_id, s.host_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1',
      [pollId]
    );

    if (checkPoll.rows.length === 0 || checkPoll.rows[0].host_id !== hostId) {
      return res.status(404).json({ error: 'Poll not found or not authorized' });
    }
    console.log(checkPoll.rows[0]);
    const sessionId = checkPoll.rows[0].session_id;

    await pool.query('UPDATE polls SET status = $1 WHERE id = $2', ['published', pollId]);

    // Fetch the updated poll data including options to send to clients
    const publishedPoll = await pool.query(
      `SELECT p.id, p.session_id, p.question, p.status, p.type,
      (SELECT COALESCE(json_agg(json_build_object('id', po.id, 'text', po.text)), '[]') 
       FROM poll_options po WHERE po.poll_id = p.id) AS options
       FROM polls p WHERE p.id = $1`,
      [pollId]
    );

    const pollData = publishedPoll.rows[0];

    // Emit the event to all clients in the session's room
   const io = req.app.get("io");
    io.to(`session-${sessionId}`).emit('pollPublished', pollData);
    res.json({ message: 'Poll published successfully', poll: pollData });

  } catch (err) {
    console.error('Publish poll route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// PUT /api/host/polls/:pollId/close
router.put('/polls/:pollId/close', auth, async (req, res) => {
  try {
    const { pollId } = req.params;
    const hostId = req.user.id;
    // Verify the host owns the poll's session
    const checkPoll = await pool.query(
      'SELECT s.host_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1',
      [pollId]
    );
    if (checkPoll.rows.length === 0 || checkPoll.rows[0].host_id !== hostId) {
      return res.status(404).json({ error: 'Poll not found or not authorized' });
    }
    await pool.query('UPDATE polls SET status = $1 WHERE id = $2', ['closed', pollId]);
    res.json({ message: 'Poll closed successfully' });
  } catch (err) {
    console.error('Close poll route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// GET /api/host/polls/:pollId/results
router.get('/polls/:pollId/results', auth, async (req, res) => {
  try {
    const { pollId } = req.params;
    const hostId = req.user.id;

    // Verify the host owns the poll's session
    const checkPoll = await pool.query(
      'SELECT s.host_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1',
      [pollId]
    );

    if (checkPoll.rows.length === 0 || checkPoll.rows[0].host_id !== hostId) {
      return res.status(404).json({ error: 'Poll not found or not authorized' });
    }

    // Get poll type (so we know if it's open-ended or option-based)
    const pollInfo = await pool.query(
      'SELECT type FROM polls WHERE id = $1',
      [pollId]
    );
    if (pollInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    const pollType = pollInfo.rows[0].type;

    let results;

   if (pollType === 'open-ended') {
  results = await pool.query(
    `SELECT 
        r.response_data, 
        pa.name AS participant_name, 
        pa.email
     FROM responses r
     JOIN participants pa ON r.participant_id = pa.id
     WHERE r.poll_id = $1`,
    [pollId]
  )
} else {
  results = await pool.query(
    `SELECT 
        pa.name AS participant_name,
        pa.email,
        o.text AS option_text
     FROM responses r
     JOIN participants pa ON r.participant_id = pa.id
     JOIN LATERAL (
        SELECT (r.response_data::jsonb ->> 'optionId')::int AS option_id
        UNION ALL
        SELECT (jsonb_array_elements_text(r.response_data::jsonb -> 'optionIds'))::int
     ) x ON TRUE
     JOIN poll_options o ON o.id = x.option_id
     WHERE r.poll_id = $1`,
    [pollId]
  )
}


    res.json({ results: results.rows });
  } catch (err) {
    console.error('Get poll results route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

export default router
