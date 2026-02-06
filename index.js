const { CONFIG } = require('./src/config');
const { createApp } = require('./src/app');
const { startDiscordBot } = require('./src/discord/bot');
const { startTunnelIfEnabled } = require('./src/tunnel');
const { initSupportDb, isDbConfigured } = require('./src/db');

async function main() {
  if (isDbConfigured()) {
    try {
      await initSupportDb();
    } catch (err) {
      console.warn(`[db] Support init failed: ${err.message}`);
    }
  } else {
    console.warn('[db] Support database not configured.');
  }

  const discord = await startDiscordBot();
  const app = createApp({ discord });

  app.get('/health', (_req, res) => {
    res.type('text/plain').send('OK');
  });

  app.listen(CONFIG.PORT, () => {
    console.log(`Server running on ${CONFIG.BASE_URL}`);
  });

  startTunnelIfEnabled();
}

main().catch((err) => {
  console.error(`Server failed to start: ${err.message}`);
});
