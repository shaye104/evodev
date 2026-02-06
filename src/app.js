const express = require('express');
const path = require('path');
const { CONFIG } = require('./config');
const { initAuth, attachStaffContext, passport } = require('./auth');
const { createSupportRouter } = require('./routes/support');
const { createPayhipRouter } = require('./routes/payhip');

function createApp({ discord }) {
  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  initAuth(app);
  app.use(attachStaffContext);

  app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.staff = req.staff;
    res.locals.baseUrl = CONFIG.BASE_URL;
    next();
  });

  app.get('/auth/discord', passport.authenticate('discord'));
  app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login' }),
    (req, res) => {
      res.redirect('/tickets');
    }
  );

  app.use(createSupportRouter({ discord }));
  app.use(createPayhipRouter({ discord }));

  return app;
}

module.exports = { createApp };
