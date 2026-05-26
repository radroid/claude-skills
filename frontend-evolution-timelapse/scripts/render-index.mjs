#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  let runDir = null;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--run-dir') runDir = process.argv[++i];
  }
  if (!runDir) throw new Error('--run-dir required');
  return runDir;
}

const runDir = parseArgs();
const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
const cost = fs.existsSync(path.join(runDir, 'cost.json'))
  ? JSON.parse(fs.readFileSync(path.join(runDir, 'cost.json'), 'utf8'))
  : null;

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const pageBlocks = (manifest.pages_summary || []).map((p) => {
  const gif = p.gif ? `<a href="${esc(p.gif)}">GIF</a>` : '—';
  const mp4 = p.mp4 ? `<a href="${esc(p.mp4)}">MP4</a>` : '—';
  const thumb = p.thumb ? `<img src="${esc(p.thumb)}" alt="${esc(p.name)}" style="max-width:280px;border:1px solid #ddd">` : '';
  return `<section><h2>${esc(p.name)}</h2><p>Frames: ${esc(p.frame_count)} · Status: ${esc(p.status || 'ok')}</p>${thumb}<p>${gif} · ${mp4}</p></section>`;
}).join('\n');

const skipped = manifest.skipped || manifest.entries?.filter((e) => e.status === 'skip') || [];
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Timelapse ${esc(manifest.run_id || '')}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    section { margin: 2rem 0; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    .meta { color: #555; font-size: 0.9rem; }
    pre { background: #f6f6f6; padding: 1rem; overflow: auto; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Frontend evolution timelapse</h1>
  <p class="meta">Run: ${esc(manifest.run_id || '—')} · Commits: ${esc(manifest.processed || 0)} processed, ${esc(manifest.skipped_count || 0)} skipped</p>
  ${cost ? `<p class="meta">Est. agent context tokens: ${esc(cost.agent_context?.tokens_est ?? '—')} · log cost avoided (est.): ${esc(cost.log_read_cost_avoided_est ?? '—')}</p>` : ''}
  ${pageBlocks}
  ${skipped.length ? `<h2>Skipped commits</h2><pre>${skipped.map((s) => `${esc(s.hash)} ${esc(s.stage)}: ${esc(s.error)}`).join('\n')}</pre>` : ''}
</body>
</html>`;

fs.writeFileSync(path.join(runDir, 'index.html'), html);
console.log(JSON.stringify({ ok: true, path: path.join(runDir, 'index.html') }));
