#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './lib/load-config.mjs';

const runDirIndex = process.argv.indexOf('--run-dir');
const runDir = runDirIndex >= 0 ? process.argv[runDirIndex + 1] : null;
if (!runDir) throw new Error('--run-dir required');

const config = loadConfig(process.cwd());
const commits = JSON.parse(fs.readFileSync(path.join(runDir, 'commits.json'), 'utf8'));
const fps = config.gif?.fps ?? 1.5;
const gifW = config.gif?.width ?? 1200;
const holdSec = (config.gif?.hold_skipped_ms ?? 400) / 1000;
const mp4Fps = config.mp4?.fps ?? 1.5;
const crf = config.mp4?.crf ?? 22;

const results = [];

for (const ent of fs.readdirSync(runDir, { withFileTypes: true })) {
  if (!ent.isDirectory() || !ent.name.startsWith('page-')) continue;
  const pageName = ent.name.replace(/^page-/, '');
  const pageDir = path.join(runDir, ent.name);
  const placeholder = path.join(pageDir, '000_placeholder.png');
  let prev = null;
  const lines = [];

  for (const c of commits) {
    const padded = String(c.index).padStart(3, '0');
    const short = c.hash.slice(0, 7);
    const matches = fs
      .readdirSync(pageDir)
      .filter((f) => f.startsWith(`${padded}_${short}`) && f.endsWith('.png'));
    if (matches.length) {
      const match = path.join(pageDir, matches[0]);
      lines.push(`file '${match}'`);
      lines.push(`duration ${(1 / fps).toFixed(3)}`);
      prev = match;
    } else if (prev) {
      lines.push(`file '${prev}'`);
      lines.push(`duration ${holdSec}`);
    } else if (fs.existsSync(placeholder)) {
      lines.push(`file '${placeholder}'`);
      lines.push(`duration ${holdSec}`);
      prev = placeholder;
    }
  }

  const fileLines = lines.filter((l) => l.startsWith('file '));
  if (!fileLines.length) {
    results.push({ page: pageName, status: 'no_frames' });
    continue;
  }

  const last = fileLines[fileLines.length - 1].replace(/^file '|'$/g, '');
  lines.push(`file '${last}'`);

  const framesPath = path.join(runDir, `frames_${pageName}.txt`);
  fs.writeFileSync(framesPath, lines.join('\n'));

  const mp4Out = path.join(pageDir, `${pageName}.mp4`);
  const gifOut = path.join(pageDir, `${pageName}.gif`);

  const mp4Result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      framesPath,
      '-vf',
      `scale=${gifW}:-2`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(mp4Fps),
      '-crf',
      String(crf),
      mp4Out,
    ],
    { encoding: 'utf8' },
  );
  if (mp4Result.status !== 0 || mp4Result.error) {
    results.push({
      page: pageName,
      status: 'fail',
      stage: 'mp4',
      error: mp4Result.error?.message || mp4Result.stderr || `ffmpeg exited ${mp4Result.status}`,
    });
    continue;
  }

  const gifResult = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      framesPath,
      '-vf',
      `fps=${fps},scale=${gifW}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      gifOut,
    ],
    { encoding: 'utf8' },
  );
  if (gifResult.status !== 0 || gifResult.error) {
    results.push({
      page: pageName,
      status: 'fail',
      stage: 'gif',
      error: gifResult.error?.message || gifResult.stderr || `ffmpeg exited ${gifResult.status}`,
    });
    continue;
  }

  const thumbs = fileLines.map((l) => l.replace(/^file '|'$/g, ''));
  results.push({
    page: pageName,
    status: 'ok',
    gif: path.relative(runDir, gifOut),
    mp4: path.relative(runDir, mp4Out),
    thumb: path.relative(runDir, thumbs[thumbs.length - 1] || ''),
    frame_count: fileLines.length,
  });
}

console.log(JSON.stringify(results));
