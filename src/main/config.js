'use strict';
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'launcher.config.json'), 'utf8'));

const siteUrl = new URL(raw.siteUrl);
if (siteUrl.protocol !== 'https:') throw new Error('launcher.config.json: siteUrl https olmalı.');

module.exports = Object.freeze({
  SITE_ORIGIN: siteUrl.origin,
  SITE_HOST: siteUrl.hostname,
  MS_CLIENT_ID: String(raw.microsoftClientId || ''),
  MS_REDIRECT: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
  // Every host the launcher may download from or talk to. Anything else is refused.
  ALLOWED_HOSTS: new Set([
    siteUrl.hostname,
    'piston-meta.mojang.com',
    'piston-data.mojang.com',
    'launchermeta.mojang.com',
    'launcher.mojang.com',
    'libraries.minecraft.net',
    'resources.download.minecraft.net',
    'meta.fabricmc.net',
    'maven.fabricmc.net',
    'login.microsoftonline.com',
    'user.auth.xboxlive.com',
    'xsts.auth.xboxlive.com',
    'api.minecraftservices.com',
    'api.modrinth.com',
    'cdn.modrinth.com',
  ]),
});
