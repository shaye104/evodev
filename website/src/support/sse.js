const clients = new Set();

function subscribe(req, res, filter) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');

  const client = { res, filter };
  clients.add(client);

  const ping = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

function publish(event) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    if (client.filter && !client.filter(event)) {
      continue;
    }
    client.res.write(payload);
  }
}

module.exports = {
  subscribe,
  publish,
};
