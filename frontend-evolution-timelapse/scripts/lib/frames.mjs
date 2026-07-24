import fs from 'node:fs';
import path from 'node:path';

/** Read page-<name>/frames.json; a missing or unreadable file reads as an
 *  empty array (the A1 R5 contract for downstream consumers). */
export function readFrames(pageDir) {
  const framesPath = path.join(pageDir, 'frames.json');
  if (!fs.existsSync(framesPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    /* unreadable file — rebuild from the next entry on */
    return [];
  }
}

/** Atomic write via temp-file-plus-rename, same pattern as writeProgress. */
export function writeFrames(pageDir, frames) {
  const tmp = path.join(pageDir, 'frames.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(frames, null, 2));
  fs.renameSync(tmp, path.join(pageDir, 'frames.json'));
}

/** Upsert this commit's entry in page-<name>/frames.json (keyed by index,
 *  kept sorted), written atomically via temp-file-plus-rename. */
export function upsertFrameEntry(pageDir, entry) {
  const frames = readFrames(pageDir);
  const at = frames.findIndex((f) => f.index === entry.index);
  if (at >= 0) frames[at] = entry;
  else frames.push(entry);
  frames.sort((a, b) => a.index - b.index);
  writeFrames(pageDir, frames);
}
