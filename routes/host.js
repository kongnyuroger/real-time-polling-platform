import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import pool from '../config/db.js'
import authlimit from '../middleware/ratelimiting.js'

import 'dotenv/config'


const router = express()

//Register user

router.post('/register', authlimit, async function(req, res, next){
  try{ 
    const {username, password, email} = req.body;
    if (!username || !password || !email) {
        return res.status(400).json({ error: 'username and password and email required' });
    }
    const checkExist = await pool.query('SELECT * from users where email = $1',[email])
    if(password.length < 8){
        return res.status(400).json({ error: 'password must be at least 8 characters' });    
    }
    const hashPassword = await bcrypt.hash(password, 10)

    if(checkExist.rows.length === 0){
        
        const newUser = await pool.query(
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING username, email, ',
      [username, hashPassword, email]
    );
    return res.json({message: "successfuly registered", newUser})
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

    const checkExist = await pool.query('SELECT * from users where email = $1',[email])

    if (checkExist.rows === 0) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = checkExist.rows[0]
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.name , email: user.email},
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





export default router 

