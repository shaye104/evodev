const { randomId, redirect, setCookie } = require('../../_lib/utils');

exports.onRequestGet = async ({ env }) => {
  const state = randomId(12);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${env.BASE_URL}/api/auth/discord/callback`,
    scope: 'identify email',
    state,
  });
  const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  const response = redirect(url);
  response.headers.set('Set-Cookie', setCookie('oauth_state', state, { maxAge: 300 }));
  return response;
};
