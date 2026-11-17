import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  access,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const require = createRequire(path.join(appRoot, 'package.json'));
const cli = require.resolve('@tauri-apps/cli/tauri.js');
const run = (args) => execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
const sourcePath = path.join(repoRoot, 'assets/branding/kirireadest.svg');
const source = await readFile(sourcePath, 'utf8');
const background = source.match(/<rect\b[^>]*data-color="bg"[^>]*\/>/);
const backgroundColor = background?.[0].match(/fill="([^"]+)"/)?.[1];
if (!backgroundColor || !source.includes('viewBox="0 0 256 256"')) {
  throw new Error('Expected the KiriReadest 256-unit SVG with a data-color="bg" rectangle.');
}

const artwork = source
  .slice(source.indexOf('<rect'), source.lastIndexOf('</svg>'))
  .replace(background[0], '');
const wrapSVG = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256">${content}</svg>`;
// Keep the artwork inside Android's adaptive-icon safe zone; the OS supplies its mask.
const foreground = (content) =>
  wrapSVG(`<g transform="translate(48.64 48.64) scale(.62)">${content}</g>`);
const nativeRoot = path.join(appRoot, 'src-tauri');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'kirireadest-icons-'));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

try {
  await writeFile(path.join(temporary, 'icon.svg'), source);
  await writeFile(path.join(temporary, 'foreground.svg'), foreground(artwork));
  await writeFile(
    path.join(temporary, 'monochrome.svg'),
    foreground(artwork.replace(/fill="[^"]+"/g, 'fill="#000000"')),
  );
  await writeFile(
    path.join(temporary, 'background.svg'),
    wrapSVG(`<rect width="256" height="256" fill="${backgroundColor}"/>`),
  );
  const manifest = path.join(temporary, 'icon.json');
  await writeFile(
    manifest,
    JSON.stringify({
      default: 'icon.svg',
      bg_color: backgroundColor,
      android_bg: 'background.svg',
      android_fg: 'foreground.svg',
      android_fg_scale: 68,
      android_monochrome: 'monochrome.svg',
    }),
  );

  // Generate in isolation: Tauri otherwise writes into an existing mobile project
  // instead of the checked-in icon directory.
  const generated = path.join(temporary, 'native');
  run(['icon', manifest, '--output', generated]);
  // Tauri writes ICNS entries in hash-map order. Sort them for repeatable builds.
  const icnsPath = path.join(generated, 'icon.icns');
  const icns = await readFile(icnsPath);
  const chunks = [];
  for (let offset = 8; offset < icns.length; ) {
    const size = icns.readUInt32BE(offset + 4);
    if (size < 8 || offset + size > icns.length) throw new Error('Invalid generated ICNS chunk.');
    chunks.push(icns.subarray(offset, offset + size));
    offset += size;
  }
  chunks.sort((a, b) => Buffer.compare(a.subarray(0, 4), b.subarray(0, 4)));
  await writeFile(icnsPath, Buffer.concat([icns.subarray(0, 8), ...chunks]));
  const android = path.join(generated, 'android');
  // Tauri 2.11.4 emits 49px for hdpi. Derive the required 72px from xxxhdpi.
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const output = path.join(temporary, name);
    run([
      'icon',
      path.join(android, 'mipmap-xxxhdpi', `${name}.png`),
      '--output',
      output,
      '--png',
      '72',
    ]);
    await copyFile(
      path.join(output, '72x72.png'),
      path.join(android, 'mipmap-hdpi', `${name}.png`),
    );
  }

  // Render an opaque SVG for iOS instead of flattening rounded PNG edges.
  const opaqueSource = path.join(temporary, 'opaque.svg');
  await writeFile(
    opaqueSource,
    source.replace(background[0], background[0].replace(/rx="[^"]+"/, 'rx="0"')),
  );
  const ios = path.join(generated, 'ios');
  const iosEntries = await Promise.all(
    (await readdir(ios))
      .filter((name) => name.endsWith('.png'))
      .map(async (name) => ({
        name,
        size: (await readFile(path.join(ios, name))).readUInt32BE(16),
      })),
  );
  const opaque = path.join(temporary, 'opaque');
  const opaqueSizes = [...new Set([...iosEntries.map(({ size }) => size), 512])];
  run(['icon', opaqueSource, '--output', opaque, '--png', opaqueSizes.join(',')]);
  for (const { name, size } of iosEntries) {
    await copyFile(path.join(opaque, `${size}x${size}.png`), path.join(ios, name));
  }
  await copyFile(
    path.join(android, 'mipmap-anydpi-v26/ic_launcher.xml'),
    path.join(android, 'mipmap-anydpi-v26/ic_launcher_round.xml'),
  );
  // Existing Android splash screens also reference this drawable.
  await mkdir(path.join(android, 'drawable'), { recursive: true });
  await writeFile(
    path.join(android, 'drawable/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n  <solid android:color="${backgroundColor}" />\n</shape>\n`,
  );
  await cp(generated, path.join(nativeRoot, 'icons'), { recursive: true });

  const androidProject = path.join(nativeRoot, 'gen/android/app/src/main/res');
  if (await exists(androidProject)) {
    await cp(android, androidProject, { recursive: true });
  }
  const iosProject = path.join(nativeRoot, 'gen/apple/Assets.xcassets/AppIcon.appiconset');
  if (await exists(iosProject)) {
    await cp(path.join(generated, 'ios'), iosProject, { recursive: true });
  }

  const web = path.join(temporary, 'web');
  run(['icon', sourcePath, '--output', web, '--png', '16,180,192,256,512,1024']);
  const publicRoot = path.join(appRoot, 'public');
  await mkdir(path.join(publicRoot, 'icons'), { recursive: true });
  for (const size of [192, 256, 512]) {
    await copyFile(
      path.join(web, `${size}x${size}.png`),
      path.join(publicRoot, 'icons', `icon-${size}.png`),
    );
  }
  await copyFile(path.join(web, '512x512.png'), path.join(publicRoot, 'icon.png'));
  await copyFile(path.join(web, '16x16.png'), path.join(publicRoot, 'icon-tiny.png'));
  await copyFile(path.join(web, '180x180.png'), path.join(publicRoot, 'apple-touch-icon.png'));
  await copyFile(path.join(generated, 'icon.ico'), path.join(publicRoot, 'favicon.ico'));
  await copyFile(sourcePath, path.join(publicRoot, 'favicon.svg'));
  await copyFile(
    path.join(web, '1024x1024.png'),
    path.join(repoRoot, 'assets/branding/kirireadest.png'),
  );
  // Store artwork is opaque and square; the store applies the outer mask.
  await copyFile(
    path.join(opaque, '512x512.png'),
    path.join(repoRoot, 'fastlane/metadata/android/en-US/images/icon.png'),
  );
  console.log('Generated KiriReadest U1 icons for desktop, Android, iOS, and web.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
