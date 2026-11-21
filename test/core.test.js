'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

// net.js / minecraft.js do not touch Electron, but config.js reads launcher.config.json — fine in tests.
const { safeJoin, checkUrl } = require('../src/main/net');
const { allowed, mavenPath, expand } = require('../src/main/minecraft');
const { MOD_NAME_RE } = require('../src/main/mods');

test('safeJoin refuses path traversal', () => {
  const base = path.resolve('C:/game');
  assert.strictEqual(safeJoin(base, 'mods/a.jar'), path.join(base, 'mods', 'a.jar'));
  assert.throws(() => safeJoin(base, '../evil.jar'));
  assert.throws(() => safeJoin(base, 'mods/../../evil.jar'));
  assert.throws(() => safeJoin(base, 'C:/Windows/system32/x.dll'));
  assert.throws(() => safeJoin(base, ''));
});

test('checkUrl only allows https + allowlisted hosts', () => {
  assert.ok(checkUrl('https://piston-data.mojang.com/x'));
  assert.ok(checkUrl('https://lumcraft.com.tr/api/launcher/me'));
  assert.throws(() => checkUrl('http://piston-data.mojang.com/x'));
  assert.throws(() => checkUrl('https://evil.example.com/x'));
  assert.throws(() => checkUrl('https://lumcraft.com.tr.evil.com/x'));
  assert.throws(() => checkUrl('https://user:pass@lumcraft.com.tr/x'));
});

test('rule evaluation', () => {
  assert.strictEqual(allowed(undefined), true);
  assert.strictEqual(allowed([{ action: 'allow', os: { name: 'windows' } }]), true);
  assert.strictEqual(allowed([{ action: 'allow', os: { name: 'osx' } }]), false);
  assert.strictEqual(allowed([{ action: 'allow' }, { action: 'disallow', os: { name: 'windows' } }]), false);
  assert.strictEqual(allowed([{ action: 'allow', features: { is_demo_user: true } }], {}), false);
  assert.strictEqual(allowed([{ action: 'allow', features: { is_quick_play_multiplayer: true } }], { is_quick_play_multiplayer: true }), true);
});

test('maven path', () => {
  assert.strictEqual(mavenPath('net.fabricmc:fabric-loader:0.16.9'), 'net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar');
  assert.strictEqual(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows'), 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
  assert.throws(() => mavenPath('a:b'));
  assert.throws(() => mavenPath('a/../..:b:c'));
});

test('argument expansion drops unknown placeholders and gated args', () => {
  const args = expand([
    '--username', '${auth_player_name}', '${unknown_thing}',
    { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
    { rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }], value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}'] },
  ], { auth_player_name: 'Utku3', quickPlayMultiplayer: 'lumcraft.com.tr:25565' }, { is_quick_play_multiplayer: true });
  assert.deepStrictEqual(args, ['--username', 'Utku3', '--quickPlayMultiplayer', 'lumcraft.com.tr:25565']);
});

test('mod file names', () => {
  assert.ok(MOD_NAME_RE.test('LumPhone-Fabric-26.3-1.3.0.jar'));
  assert.ok(!MOD_NAME_RE.test('../x.jar'));
  assert.ok(!MOD_NAME_RE.test('x.exe'));
  assert.ok(!MOD_NAME_RE.test('a\\b.jar'));
});

test('mod catalog selection', () => {
  const { CATALOG, DEFAULT_SELECTED, sanitizeSelection } = require('../src/main/catalog');
  const slugs = CATALOG.map((m) => m.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length, 'tekrar eden slug var');
  for (const mod of CATALOG) for (const other of mod.conflicts || []) assert.ok(slugs.includes(other), `${mod.slug} -> ${other}`);
  assert.deepStrictEqual(sanitizeSelection(undefined), [...DEFAULT_SELECTED]);
  assert.deepStrictEqual(sanitizeSelection(['sodium', 'sodium', 'yok-boyle-mod', 5, '../x']), ['sodium']);
  assert.deepStrictEqual(sanitizeSelection(['punchy-fpa', 'first-person-model']), ['punchy-fpa']);
  assert.deepStrictEqual(sanitizeSelection([]), []);
});

test('modrinth hosts are allowed, others are not', () => {
  assert.ok(checkUrl('https://cdn.modrinth.com/data/AANobbMI/versions/x/sodium.jar'));
  assert.ok(checkUrl('https://api.modrinth.com/v2/projects'));
  assert.throws(() => checkUrl('https://modrinth.com.evil.com/x'));
});

void Module;
