import { clearCookie, redirect } from '../_lib/utils.js';

export const onRequestGet = async () => {
  const response = redirect('/');
  response.headers.set('Set-Cookie', clearCookie('evo_session'));
  return response;
};
