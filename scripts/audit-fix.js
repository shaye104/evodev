const { execSync } = require('child_process');

try {
  execSync('npm audit fix --force', { stdio: 'inherit' });
} catch (err) {
  console.error('npm audit fix failed. You may need elevated permissions.');
  process.exit(err.status || 1);
}
