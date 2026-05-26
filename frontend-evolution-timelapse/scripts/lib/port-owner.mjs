import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function detectPortTool() {
  if (spawnSync('which', ['lsof'], { encoding: 'utf8' }).status === 0) return 'lsof';
  if (spawnSync('which', ['ss'], { encoding: 'utf8' }).status === 0) return 'ss';
  return null;
}

/** True if `pid` is `ancestor` or a descendant process (Next.js turbopack worker pattern). */
export function isDescendantOf(pid, ancestor) {
  if (!pid || !ancestor) return false;
  if (pid === ancestor) return true;
  let current = pid;
  for (let i = 0; i < 32; i++) {
    const r = spawnSync('ps', ['-o', 'ppid=', '-p', String(current)], {
      encoding: 'utf8',
    });
    if (r.status !== 0) return false;
    const ppid = parseInt((r.stdout || '').trim(), 10);
    if (!ppid || ppid <= 1) return false;
    if (ppid === ancestor) return true;
    current = ppid;
  }
  return false;
}

export function pidsOnPort(port) {
  const tool = detectPortTool();
  if (tool === 'lsof') {
    const r = spawnSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    if (r.status !== 0 || !r.stdout.trim()) return [];
    return r.stdout
      .trim()
      .split('\n')
      .map((s) => parseInt(s, 10))
      .filter(Boolean);
  }
  if (tool === 'ss') {
    const r = spawnSync('ss', ['-ltnp'], { encoding: 'utf8' });
    const lines = (r.stdout || '').split('\n').filter((l) => l.includes(`:${port}`));
    const pids = [];
    for (const line of lines) {
      const m = line.match(/pid=(\d+)/);
      if (m) pids.push(parseInt(m[1], 10));
    }
    return pids;
  }
  return [];
}

export function pidOnPort(port) {
  return pidsOnPort(port)[0] ?? null;
}

export function waitForReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = fetch(url, { signal: AbortSignal.timeout(3000) });
      // sync wait via deasync not available — use sync http for bash layer instead
    } catch {
      /* continue in async version */
    }
  }
}

/** Poll HTTP until 200 (Node 18+ fetch). */
export async function pollReady(url, timeoutMs) {
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status < 500) return { ok: true, status: res.status };
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, error: lastErr };
}

/** Tail log file for "Local: http://localhost:PORT" (Vite etc). */
export function parsePortFromLog(logPath, defaultPort) {
  if (!fs.existsSync(logPath)) return defaultPort;
  const text = fs.readFileSync(logPath, 'utf8');
  const m =
    text.match(/Local:\s+https?:\/\/[^:]+:(\d+)/) ||
    text.match(/localhost:(\d+)/) ||
    text.match(/on port (\d+)/i);
  return m ? parseInt(m[1], 10) : defaultPort;
}

export async function waitForPortInLog(logPath, defaultPort, timeoutMs) {
  const start = Date.now();
  let offset = 0;
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logPath)) {
      const st = fs.statSync(logPath);
      if (st.size > offset) {
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(st.size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        offset = st.size;
        const chunk = buf.toString('utf8');
        const m =
          chunk.match(/Local:\s+https?:\/\/[^:]+:(\d+)/) ||
          chunk.match(/ready on.*:(\d+)/i);
        if (m) return parseInt(m[1], 10);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return defaultPort;
}
