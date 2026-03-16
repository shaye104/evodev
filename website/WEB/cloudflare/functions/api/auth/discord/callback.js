import {
  encodeSession,
  getCookie,
  setCookie,
  redirect,
} from '../../../_lib/utils.js';
import { upsertUserFromDiscord, ensureAdminSeed } from '../../../_lib/db.js';

async function exchangeCode(env, code) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${env.BASE_URL}/api/auth/discord/callback`,
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error('OAuth token exchange failed');
  }
  return res.json();
}

async function fetchDiscordProfile(token) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Discord profile');
  }
  return res.json();
}

export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = getCookie(request, 'oauth_state');

  if (!code || !state || state !== expectedState) {
    return redirect('/login.html');
  }

  try {
    await ensureAdminSeed(env);
    const token = await exchangeCode(env, code);
    const profile = await fetchDiscordProfile(token.access_token);
    const user = await upsertUserFromDiscord(env, profile);
    if (!user) return redirect('/login.html');
    const session = await encodeSession(env.SESSION_SECRET, {
      user_id: user.id,
      discord_id: user.discord_id,
    });
    const response = redirect('/tickets.html');
    response.headers.set('Set-Cookie', setCookie('oauth_state', '', { maxAge: 0 }));
    response.headers.append(
      'Set-Cookie',
      setCookie('evo_session', session, { maxAge: 60 * 60 * 24 * 7 })
    );
    return response;
  } catch (err) {
    console.error(err);
    return redirect('/login.html');
  }
};
