const { execSync } = require('child_process');

try {
  execSync('npm install -g npm@11.9.0', { stdio: 'inherit' });
} catch (err) {
  console.error('npm update failed. You may need elevated permissions.');
  process.exit(err.status || 1);
}
