// Builds the Windows app folder (with "QuackNana Marble Race.exe") into dist/.
// Works on Windows, macOS and Linux:  npm run build:win

import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;

const out = path.join(root, 'dist');
const [appDir] = await packager({
  dir: root,
  out,
  platform: 'win32',
  arch: 'x64',
  electronVersion,
  name: pkg.productName,
  executableName: pkg.productName,
  appVersion: pkg.version,
  buildVersion: pkg.version,
  appCopyright: 'QuackNana Marble Race',
  icon: path.join(root, 'build', 'icon.ico'),
  asar: true,
  prune: true,
  overwrite: true,
  ignore: [
    /^\/dist($|\/)/, /^\/scripts($|\/)/, /^\/build($|\/)/, /^\/\.git/, /^\/\.github/, /^\/release($|\/)/,
    /^\/stream-kit($|\/)/,
    /\.map$/, /^\/node_modules\/planck\/(src|docs|testbed)($|\/)/, /planck-with-testbed/,
  ],
  win32metadata: {
    CompanyName: 'QuackNana',
    FileDescription: pkg.productName,
    ProductName: pkg.productName,
    InternalName: 'QuackNanaMarbleRace',
    OriginalFilename: pkg.productName + '.exe',
  },
});

// only English UI strings are needed; dropping the other languages saves ~40 MB
const locales = path.join(appDir, 'locales');
for (const f of fs.readdirSync(locales)) {
  if (f !== 'en-US.pak') fs.rmSync(path.join(locales, f));
}

fs.copyFileSync(path.join(root, 'HOW-TO-USE.txt'), path.join(appDir, 'HOW-TO-USE.txt'));
console.log('Built ' + appDir);
