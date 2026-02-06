const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const crypto = require('crypto');
const { CONFIG } = require('./config');
const supportService = require('./support/service');

function getSessionSecret() {
  if (CONFIG.SESSION_SECRET) return CONFIG.SESSION_SECRET;
  const secret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET missing. Using a random secret.');
  return secret;
}

function initAuth(app) {
  if (!CONFIG.DISCORD_OAUTH_CLIENT_ID || !CONFIG.DISCORD_CLIENT_SECRET) {
    console.warn('[auth] Discord OAuth is missing client ID or secret.');
  }
  app.use(
    session({
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: CONFIG.BASE_URL.startsWith('https://'),
      },
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await supportService.getUserById(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  passport.use(
    'discord',
    new OAuth2Strategy(
      {
        authorizationURL: 'https://discord.com/api/oauth2/authorize',
        tokenURL: 'https://discord.com/api/oauth2/token',
        clientID: CONFIG.DISCORD_OAUTH_CLIENT_ID,
        clientSecret: CONFIG.DISCORD_CLIENT_SECRET,
        callbackURL: `${CONFIG.BASE_URL}/auth/discord/callback`,
        scope: ['identify', 'email'],
      },
      async (...args) => {
        const done = args[args.length - 1];
        const accessToken = args[0];
        try {
          const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) {
            return done(new Error('Failed to fetch Discord profile'));
          }
          const profile = await res.json();
          const user = await supportService.upsertUserFromDiscord(profile);
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  app.use(passport.initialize());
  app.use(passport.session());
}

function ensureUser(req, res, next) {
  if (req.user) return next();
  return res.redirect('/login');
}

async function attachStaffContext(req, _res, next) {
  if (!req.user) {
    req.staff = null;
    return next();
  }
  try {
    req.staff = await supportService.getStaffByUserId(req.user.id);
  } catch {
    req.staff = null;
  }
  return next();
}

function hasPermission(staff, permission) {
  if (!staff) return false;
  if (staff.is_admin) return true;
  if (!staff.permissions) return false;
  try {
    const perms = JSON.parse(staff.permissions);
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  } catch {
    return false;
  }
}

function ensureStaff(req, res, next) {
  if (req.staff) return next();
  return res.status(403).send('Staff access required.');
}

function ensureAdmin(req, res, next) {
  if (req.staff && req.staff.is_admin) return next();
  return res.status(403).send('Admin access required.');
}

function ensurePermission(permission) {
  return (req, res, next) => {
    if (hasPermission(req.staff, permission)) return next();
    return res.status(403).send('Permission denied.');
  };
}

module.exports = {
  initAuth,
  ensureUser,
  ensureStaff,
  ensureAdmin,
  ensurePermission,
  attachStaffContext,
  hasPermission,
  passport,
};
