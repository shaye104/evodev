const { execSync } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    await sleep(5000);
    execSync('npm audit', { stdio: 'inherit' });
  } catch (err) {
    console.error('npm audit failed. You may need elevated permissions.');
    process.exit(err.status || 1);
  }
}

main();
