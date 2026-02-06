const { clearCookie, redirect } = require('../_lib/utils');

exports.onRequestGet = async () => {
  const response = redirect('/');
  response.headers.set('Set-Cookie', clearCookie('evo_session'));
  return response;
};
