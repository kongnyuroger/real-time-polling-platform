import express from 'express'
import pool from '../config/db.js'

const router = express()

// Check if a session exists
router.get('/sessions/:sessionCode', async (req, res) => {
  try {
    const { sessionCode } = req.params;
    const session = await pool.query('SELECT id, name FROM sessions WHERE session_code = $1', [sessionCode]);
    
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ session: session.rows[0] });

  } catch (err) {
    console.error('Get session route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Join a session
router.post('/sessions/:sessionCode/join', async (req, res) => {
  try {
    const { sessionCode } = req.params;
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const session = await pool.query('SELECT id FROM sessions WHERE session_code = $1', [sessionCode]);
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const sessionId = session.rows[0].id;

    // Check if participant already exists in this session
    const existingParticipant = await pool.query(
      'SELECT id FROM participants WHERE session_id = $1 AND email = $2',
      [sessionId, email]
    );

    let participantId;
    if (existingParticipant.rows.length > 0) {
      participantId = existingParticipant.rows[0].id;
    } else {
      const newParticipant = await pool.query(
        'INSERT INTO participants (session_id, name, email) VALUES ($1, $2, $3) RETURNING id',
        [sessionId, name, email]
      );
      participantId = newParticipant.rows[0].id;
    }

    res.status(200).json({
      message: 'Joined session successfully',
      participantId: participantId,
      sessionId: sessionId
    });

  } catch (err) {
    console.error('Join session route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get all published polls for a session
router.get('/sessions/:sessionCode/polls', async (req, res) => {
  try {
    const { sessionCode } = req.params;
    const session = await pool.query('SELECT id FROM sessions WHERE session_code = $1', [sessionCode]);
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const sessionId = session.rows[0].id;
    
    const polls = await pool.query(
      `SELECT p.id, p.question, p.status, p.type,
       (SELECT COALESCE(json_agg(json_build_object('id', po.id, 'text', po.text)), '[]') 
        FROM poll_options po WHERE po.poll_id = p.id) AS options
       FROM polls p WHERE p.session_id = $1 AND p.status = 'published' ORDER BY p.id`,
      [sessionId]
    );
    
    res.json({ polls: polls.rows });
    
  } catch (err) {
    console.error('Get polls route error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});


// Submit or update poll response
router.post('/polls/:pollId/submit', async (req, res) => {
  const { pollId } = req.params;
  const { participantId, responseData } = req.body;

  if (!participantId || !responseData) {
    return res.status(400).json({ error: 'Missing participantId or responseData' });
  }

  try {
    await pool.query(
      `INSERT INTO responses (poll_id, participant_id, response_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, participant_id)
       DO UPDATE SET response_data = EXCLUDED.response_data`,
      [pollId, participantId, responseData]
    );

    res.json({ success: true, message: 'Response saved successfully' });
  } catch (err) {
    console.error('Error saving response:', err);
    res.status(500).json({ error: 'Error saving response' });
  }
});



export default router
