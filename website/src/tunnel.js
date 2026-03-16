const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function resolveCloudflaredBin(cf) {
  if (!cf) return '';
  if (typeof cf.bin === 'function') return cf.bin();
  if (typeof cf.path === 'function') return cf.path();
  return cf.bin || cf.path || cf.default?.bin || cf.default?.path || '';
}

function findCloudflaredBin() {
  const candidates = [
    String(process.env.CLOUDFLARED_BIN || '').trim(),
    path.join(process.cwd(), 'node_modules', '.bin', 'cloudflared'),
    path.join(process.cwd(), 'node_modules', 'cloudflared', 'bin', 'cloudflared'),
    path.join(
      process.cwd(),
      'node_modules',
      'cloudflared',
      'bin',
      'cloudflared-linux-amd64'
    ),
    '/usr/local/bin/cloudflared',
    'cloudflared',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'cloudflared') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

async function startTunnelIfEnabled() {
  if (process.env.ENABLE_TUNNEL !== '1') return;
  const tunnelId = String(process.env.CLOUDFLARED_TUNNEL_ID || '').trim();
  const tunnelToken = String(process.env.CLOUDFLARED_TOKEN || '').trim();
  if (!tunnelId) {
    if (!tunnelToken) {
      console.warn(
        'ENABLE_TUNNEL=1 but CLOUDFLARED_TUNNEL_ID/CLOUDFLARED_TOKEN is missing.'
      );
      return;
    }
  }

  try {
    let cloudflared;
    try {
      cloudflared = require('cloudflared');
      if (typeof cloudflared.install === 'function') {
        await cloudflared.install();
      }
    } catch {
      cloudflared = null;
    }

    const binPath = resolveCloudflaredBin(cloudflared) || findCloudflaredBin();
    if (!binPath) {
      console.warn(
        'cloudflared binary not found. Set CLOUDFLARED_BIN to the full path.'
      );
      return;
    }

    const args = tunnelToken
      ? ['tunnel', 'run', '--token', tunnelToken]
      : ['tunnel', 'run', tunnelId];
    const proc = spawn(binPath, args, {
      stdio: 'inherit',
    });
    proc.on('exit', (code) => {
      console.warn(`cloudflared exited with code ${code}`);
    });
  } catch (err) {
    console.error(`cloudflared start failed: ${err.message}`);
  }
}

module.exports = { startTunnelIfEnabled };
