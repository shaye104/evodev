const { getUserContext } = require('../_lib/auth');
const { requireApiUser } = require('../_lib/api');

function formatEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

exports.onRequestGet = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiUser(user);
  if (guard) return guard;

  const url = new URL(request.url);
  let since = url.searchParams.get('since');
  if (!since) {
    since = new Date(Date.now() - 60000).toISOString();
  }

  const stream = new ReadableStream({
    async start(controller) {
      let last = since;
      let isOpen = true;

      const send = (text) => controller.enqueue(new TextEncoder().encode(text));
      send(formatEvent('ready', {}));

      for (let i = 0; i < 15 && isOpen; i += 1) {
        const results = await env.DB.prepare(
          `
          SELECT public_id, creator_user_id, updated_at, last_message_at
          FROM tickets
          WHERE (updated_at > ? OR last_message_at > ?)
          ORDER BY updated_at ASC
          `
        )
          .bind(last, last)
          .all();

        if (results.results && results.results.length) {
          for (const row of results.results) {
            if (!staff && row.creator_user_id !== user.id) {
              continue;
            }
            send(formatEvent('ticket.updated', {
              public_id: row.public_id,
              creator_user_id: row.creator_user_id,
            }));
            last = row.updated_at || row.last_message_at || last;
          }
        }

        send(formatEvent('ping', {}));
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      isOpen = false;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
