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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Adjust this for production
        methods: ['GET', 'POST', 'PUT']
    }
});
createTables();

// Middleware
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Pass io to the routers
app.use((req, res, next) => {
    req.app.io = io;
    next();
});

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
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

export default server;
