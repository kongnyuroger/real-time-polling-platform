import createError from 'http-errors'; 
import cookieParser from 'cookie-parser'
import logger from 'morgan';
import express from 'express';
import path from 'path'
import createTables from './config/db-init.js'

import  indexRouter from './routes/index.js';
import hostRouter from './routes/host.js';
import participantRouter from './routes/paticipant.js'

const app = express();
createTables();
// view engine setup

app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


app.use('/', indexRouter);
app.use('/api/host', hostRouter);
app.use('/api/paticipant',participantRouter)

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

export default app;
