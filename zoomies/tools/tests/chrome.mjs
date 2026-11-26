// One place that finds Chromium for every suite: $CHROME wins, else the newest
// /opt/pw-browsers/chromium-*/ build (either chrome-linux64 or chrome-linux layout).
import { readdirSync, existsSync } from 'node:fs';
const root = '/opt/pw-browsers';
function find() {
  if (process.env.CHROME) return process.env.CHROME;
  try {
    const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9)));
    for (const d of dirs) for (const sub of ['chrome-linux64', 'chrome-linux']) {
      const p = `${root}/${d}/${sub}/chrome`;
      if (existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  return `${root}/chromium/chrome-linux/chrome`;
}
export const CHROME_PATH = find();
