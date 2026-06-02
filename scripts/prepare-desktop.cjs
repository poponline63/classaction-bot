const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

const standaloneRoot = path.join(root, '.next', 'standalone');
assertExists(path.join(standaloneRoot, 'server.js'), 'Missing .next/standalone/server.js. Run npm run build first.');

copyDir(path.join(root, '.next', 'static'), path.join(standaloneRoot, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(standaloneRoot, 'public'));

console.log('[prepare-desktop] Next standalone assets are ready.');
