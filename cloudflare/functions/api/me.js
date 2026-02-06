const { jsonResponse } = require('../_lib/utils');
const { getUserContext } = require('../_lib/auth');

exports.onRequestGet = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  return jsonResponse({ user, staff });
};
