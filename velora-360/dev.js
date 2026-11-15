// Starts backend (port 4200) and frontend (port 5190) together.
// Every log line is prefixed with [backend] or [frontend] so you know where a problem comes from.
import { spawn } from 'node:child_process';

const run = (name, dir, color) => {
  const p = spawn(process.execPath, [dir === 'backend' ? 'src/server.js' : 'server.js'], { cwd: new URL(`./${dir}/`, import.meta.url) });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => out.write(tag + l.replace(/^\[(backend|frontend)\]\s*/, '') + '\n')));
  pipe(p.stdout, process.stdout); pipe(p.stderr, process.stderr);
  p.on('exit', (code) => { console.log(`${tag}stopped (exit code ${code})`); if (code) process.exitCode = code; });
  return p;
};
const procs = [run('backend', 'backend', 36), run('frontend', 'frontend', 35)];
process.on('SIGINT', () => { procs.forEach(p => p.kill('SIGINT')); process.exit(0); });
