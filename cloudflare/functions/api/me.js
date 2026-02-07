import { jsonResponse } from '../_lib/utils.js';
import { getUserContext } from '../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  // Nav rendering depends on /api/me. Never allow this endpoint to throw.
  try {
    const { user, staff } = await getUserContext(env, request);
    return jsonResponse({ user, staff });
  } catch {
    return jsonResponse({ user: null, staff: null });
  }
};
