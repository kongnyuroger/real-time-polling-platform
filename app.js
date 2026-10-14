import createError from 'http-errors'; 
import cookieParser from 'cookie-parser'
import logger from 'morgan';
import express from 'express';
import path from 'path'
import createTables from './config/db-init.js'
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import indexRouter from './routes/index.js';
import hostRouter from './routes/host.js';
import participantRouter from './routes/participant.js'
import dotenv from 'dotenv'

dotenv.config()
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.ORIGIN , // Adjust this for production
        methods: ['GET', 'POST', 'PUT']
    }
});
createTables();

app.set("io", io);

// Behind a reverse proxy (Railway, Render, ...) the client IP comes from
// X-Forwarded-For; rate limiting needs it to tell clients apart.
if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

// Middleware
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Pass io to the routers


// Routes
app.use('/', indexRouter);
app.use('/api/host', hostRouter);
app.use('/api/participant', participantRouter);

// Socket.IO event handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Participant joins a session room
    socket.on('joinSession', (sessionId) => {
        socket.join(`session-${sessionId}`);
        console.log("i joined the session")
        console.log(`User ${socket.id} joined session-${sessionId}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  // only expose the stack in development
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(req.app.get('env') === 'development' && { stack: err.stack })
  });
});

export default server;
