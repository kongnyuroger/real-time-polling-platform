import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;
//connectionString: process.env.DATABASE_URL,
const pool = new Pool({

  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  database: process.env.DB_NAME || "pollingdb",
  password: process.env.Db_PASSWORD || '1234',
  port: process.env.DB_PORT || 5432,
});

export default pool;

//user, host, database, password and port variables rather than this connectionString: process.env.DATABASE_URL,
