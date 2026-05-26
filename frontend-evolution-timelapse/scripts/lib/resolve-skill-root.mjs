import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function resolveSkillRoot() {
  if (process.env.SKILL_ROOT) return process.env.SKILL_ROOT;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

export function resolveScriptsDir() {
  return path.join(resolveSkillRoot(), 'scripts');
}
