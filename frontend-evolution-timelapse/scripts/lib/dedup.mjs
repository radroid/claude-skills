import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { minimatch } from 'minimatch';

/* Internal constants of the comparator, deliberately not config (the design's
   decisions addendum enumerates the user options and these are not among
   them): raster 64×40 grayscale, per-pixel anti-aliasing tolerance ±8/255. */
export const RASTER_WIDTH = 64;
export const RASTER_HEIGHT = 40;
export const RASTER_BYTES = RASTER_WIDTH * RASTER_HEIGHT;
const PIXEL_TOLERANCE = 8;

/** Decode a PNG to a 64×40 8-bit grayscale raster (2560 bytes) via system
 *  ffmpeg — no image libraries (I7). Aspect is forced regardless of source
 *  dimensions, which also normalises variable-height full_page captures.
 *  Per-file failures (non-zero exit, wrong byte count) return {ok: false};
 *  a spawn failure (ffmpeg vanished mid-run) throws so the run aborts. */
export function decodeRaster(pngPath) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      pngPath,
      '-vf',
      `scale=${RASTER_WIDTH}:${RASTER_HEIGHT}:flags=area,format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) {
    return {
      ok: false,
      error: `ffmpeg exited ${r.status}: ${(r.stderr || '').toString().trim()}`,
    };
  }
  const raster = r.stdout;
  if (!raster || raster.length !== RASTER_BYTES) {
    return {
      ok: false,
      error: `ffmpeg produced ${raster ? raster.length : 0} bytes, expected ${RASTER_BYTES}`,
    };
  }
  return { ok: true, raster };
}

/** Pixelwise diff ratio in [0,1] over two RASTER_BYTES buffers. A pixel
 *  differs when its absolute byte difference exceeds PIXEL_TOLERANCE
 *  (strictly greater). */
export function compareRasters(a, b) {
  let differing = 0;
  for (let i = 0; i < RASTER_BYTES; i++) {
    const d = a[i] - b[i];
    if (d > PIXEL_TOLERANCE || d < -PIXEL_TOLERANCE) differing += 1;
  }
  return differing / RASTER_BYTES;
}

/** SHA-256 over the frontend-relevant `<objectname> <path>` lines of a
 *  commit's tree, in ls-tree path order. Identical hash ⇔ identical frontend
 *  file contents ⇒ identical render (modulo genuinely dynamic content).
 *  No checkout needed — the object store is shared with the worktree.
 *  Path matching mirrors relevance filtering in list-commits.mjs
 *  (minimatch, dot: true). `-z` keeps paths raw instead of C-quoted. */
export function frontendTreeHash(repoRoot, commitHash, patterns) {
  const r = spawnSync('git', ['ls-tree', '-r', '-z', commitHash], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`git ls-tree -r ${commitHash}: ${r.stderr || r.stdout}`);
  }
  const h = createHash('sha256');
  for (const line of r.stdout.split('\0')) {
    if (!line) continue;
    /* <mode> SP <type> SP <object> TAB <path> */
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const filePath = line.slice(tab + 1);
    if (!patterns.some((p) => minimatch(filePath, p, { dot: true }))) continue;
    const objectName = line.slice(0, tab).split(' ')[2];
    h.update(`${objectName} ${filePath}\n`);
  }
  return h.digest('hex');
}
