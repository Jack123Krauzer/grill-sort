import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'out');
const android = join(root, 'android');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const platform = sdk ? join(sdk, 'platforms/android-36/android.jar') : join(root, '.sdk/platform/android-36/android.jar');
const buildTools = sdk ? join(sdk, 'build-tools/36.0.0') : join(root, '.sdk/build-tools/android-16');
const extension = process.platform === 'win32' ? '.exe' : '';
const sdkTool = (name) => join(buildTools, name + extension);
const javaTool = (name) => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + extension) : name;

function run(program, args) {
  const result = spawnSync(program, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${program} failed (${result.status}).`);
}

function httpsUrl(value, name, originOnly = false) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || (originOnly && (url.pathname !== '/' || url.search))) {
    throw new Error(`${name} requires an HTTPS ${originOnly ? 'origin' : 'URL'}.`);
  }
  return originOnly ? url.origin : url.href;
}

const apiOrigin = httpsUrl(process.env.GRILL_API_ORIGIN, 'GRILL_API_ORIGIN', true);
const shareUrl = httpsUrl(process.env.GRILL_SHARE_URL ?? apiOrigin, 'GRILL_SHARE_URL');
const keystore = process.env.GRILL_ANDROID_KEYSTORE;
if (keystore && (!process.env.GRILL_ANDROID_STOREPASS || !process.env.GRILL_ANDROID_KEY_ALIAS)) {
  throw new Error('A release keystore requires GRILL_ANDROID_STOREPASS and GRILL_ANDROID_KEY_ALIAS.');
}
if (!existsSync(platform) || !existsSync(sdkTool('aapt2'))) {
  throw new Error('Install Android platform 36 and build-tools 36.0.0, then set ANDROID_SDK_ROOT.');
}

run(process.execPath, [join(root, 'tools/build.mjs')]);
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, '.android-build-'));
try {
  const res = join(stage, 'res');
  const assets = join(stage, 'assets');
  const classes = join(stage, 'classes');
  const dex = join(stage, 'dex');
  await Promise.all([mkdir(join(res, 'drawable-nodpi'), { recursive: true }), mkdir(classes), mkdir(dex)]);
  await cp(join(android, 'res'), res, { recursive: true });
  await cp(join(root, 'public/icons/skewer-512.png'), join(res, 'drawable-nodpi/skewer_icon.png'));
  await cp(join(root, 'dist'), join(assets, 'web'), { recursive: true });
  const config = join(stage, 'BuildConfig.java');
  await writeFile(config, `package com.skewershift.game;
final class BuildConfig {
    static final String API_ORIGIN = ${JSON.stringify(apiOrigin)};
    static final String SHARE_URL = ${JSON.stringify(shareUrl)};
}\n`);

  const resources = join(stage, 'resources.zip');
  const unsigned = join(stage, 'unsigned.apk');
  const aligned = join(stage, 'aligned.apk');
  const signed = join(stage, 'signed.apk');
  const archive = join(stage, 'classes.jar');
  const javaSources = join(android, 'src/com/skewershift/game');
  const sources = (await readdir(javaSources)).filter((file) => file.endsWith('.java')).map((file) => join(javaSources, file));
  const signer = join(buildTools, 'lib/apksigner.jar');

  run(sdkTool('aapt2'), ['compile', '--dir', res, '-o', resources]);
  run(sdkTool('aapt2'), ['link', '-I', platform, '--manifest', join(android, 'AndroidManifest.xml'), '-A', assets, '-o', unsigned, resources]);
  run(javaTool('javac'), ['--release', '8', '-encoding', 'UTF-8', '-cp', platform, '-d', classes, config, ...sources]);
  run(javaTool('jar'), ['cf', archive, '-C', classes, '.']);
  run(javaTool('java'), ['-cp', join(buildTools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--release', '--min-api', '26', '--lib', platform, '--output', dex, archive]);
  run(javaTool('jar'), ['uf', unsigned, '-C', dex, 'classes.dex']);
  run(sdkTool('zipalign'), ['-f', '4', unsigned, aligned]);

  const debugStore = join(output, '.android-test-signing.keystore');
  if (!keystore && !existsSync(debugStore)) {
    run(javaTool('keytool'), ['-genkeypair', '-keystore', debugStore, '-storepass', 'android', '-keypass', 'android',
      '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Skewer Shift Development']);
  }
  const signing = keystore
    ? ['--ks', resolve(keystore), '--ks-key-alias', process.env.GRILL_ANDROID_KEY_ALIAS, '--ks-pass', 'env:GRILL_ANDROID_STOREPASS']
    : ['--ks', debugStore, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android'];
  if (keystore && process.env.GRILL_ANDROID_KEYPASS) signing.push('--key-pass', 'env:GRILL_ANDROID_KEYPASS');
  run(javaTool('java'), ['-jar', signer, 'sign', ...signing, '--out', signed, aligned]);
  run(javaTool('java'), ['-jar', signer, 'verify', '--verbose', signed]);
  const target = join(output, 'Skewer-Shift.apk');
  await rename(signed, target);
  console.log(`Built ${target}${keystore ? '' : ' with a development signature'}.`);
  if (!apiOrigin) console.log('Offline build with the public WELCOME reward. Set GRILL_API_ORIGIN to enable online code redemption.');
} finally {
  await rm(stage, { recursive: true, force: true });
}
