import { jsonResponse } from '../_lib/utils.js';
import { getUserContext } from '../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  return jsonResponse({ user, staff });
};
