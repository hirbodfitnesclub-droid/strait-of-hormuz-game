// ساخت خروجی استاتیک بازی برای Capacitor: روت‌های API کنار گذاشته می‌شوند
// (در اپ آفلاین‌اند؛ فرانت‌اند نبودشان را تحمل می‌کند)، بعد برگردانده می‌شوند.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const api = 'src/app/api';
const aside = 'src/app/_api_aside';
const had = fs.existsSync(api);
const manifest = 'src/app/manifest.ts';
const manifestAside = 'src/app/_manifest_aside.ts';
const hadManifest = fs.existsSync(manifest);
try {
  // Next's generated development route types still reference server-only API
  // routes after those routes are excluded. Regenerate against this build.
  for (const generated of ['.next/types', '.next/dev/types']) {
    fs.rmSync(generated, { recursive: true, force: true });
  }
  if (had) fs.renameSync(api, aside);
  if (hadManifest) fs.renameSync(manifest, manifestAside);
  execSync('npx next build', {
    stdio: 'inherit',
    env: { ...process.env, STATIC_EXPORT: '1', DATABASE_URL: 'postgres://dummy:dummy@localhost:5432/dummy' },
  });
} finally {
  if (had && fs.existsSync(aside)) fs.renameSync(aside, api);
  if (hadManifest && fs.existsSync(manifestAside)) fs.renameSync(manifestAside, manifest);
}
console.log('static export ready in out/');
