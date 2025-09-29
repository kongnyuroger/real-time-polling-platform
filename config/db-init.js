import db from './db.js'; 

async function createTables() {
  try {
    // Hosts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      );
    `);

    // Sessions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
        session_code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL
      );
    `);

    // Polls table
    await db.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        type VARCHAR(20) NOT NULL
      );
    `);

    // Poll options table
    await db.query(`
      CREATE TABLE IF NOT EXISTS poll_options (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
        text TEXT NOT NULL
      );
    `);

    // Participants table
    await db.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        name VARCHAR(255),
        email VARCHAR(255),
        UNIQUE(session_id, email)
      );
    `);

    // Responses table
    await db.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
        participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
        response_data JSONB NOT NULL,
        UNIQUE(poll_id, participant_id)
      );
    `);

    console.log('All tables created successfully!');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}

export default createTables;
