import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const apiProc = spawn(process.execPath, ['--no-warnings', 'server/index.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const webProc = spawn(process.execPath, [viteBin, '--port', '5173'], {
  cwd: root,
  stdio: 'inherit',
});

const shutdown = () => {
  apiProc.kill();
  webProc.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
