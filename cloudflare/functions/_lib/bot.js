const { jsonResponse } = require('./utils');

function requireBotAuth(env, request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.BOT_API_TOKEN || token !== env.BOT_API_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

module.exports = { requireBotAuth };
