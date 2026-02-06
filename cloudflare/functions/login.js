exports.onRequestGet = () => new Response(null, {
  status: 302,
  headers: { Location: '/login.html' },
});
