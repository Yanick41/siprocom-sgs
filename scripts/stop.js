'use strict';

/**
 * Frees the dev ports: `npm run stop`
 *
 * Targets whatever is listening on 4000, 5173 and Vite's fallback range, so a
 * dev server left running in a closed terminal does not block the next start.
 * Only these ports are touched - killing every node process would take out
 * unrelated work.
 */

const { execSync } = require('node:child_process');

const PORTS = [4000, 5280, 5281, 5173, 5174];
const isWindows = process.platform === 'win32';

/**
 * Returns the PIDs listening on a port, or [] if none.
 *
 * Windows uses Get-NetTCPConnection rather than parsing netstat: netstat did
 * not report an IPv6 loopback listener that Get-NetTCPConnection found, and
 * scraping its columns is fragile besides.
 */
function pidsOnPort(port) {
  try {
    if (isWindows) {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      return [...new Set(out.split('\n').map((l) => l.trim()).filter((pid) => /^\d+$/.test(pid) && pid !== '0'))];
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return []; // no match - the command exits non-zero when nothing is found
  }
}

let stopped = 0;

for (const port of PORTS) {
  for (const pid of pidsOnPort(port)) {
    try {
      if (isWindows) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      else process.kill(Number(pid), 'SIGKILL');
      console.log(`  stopped pid ${pid} on port ${port}`);
      stopped += 1;
    } catch {
      console.log(`  could not stop pid ${pid} on port ${port} (already gone?)`);
    }
  }
}

console.log(stopped === 0 ? '  Nothing was running.\n' : `\n  ${stopped} process(es) stopped.\n`);
