// Run after generating and reviewing the image/audio manifests.
const fs = require('node:fs');
const assets = ['docs/level-image-manifest.json','docs/level-voice-manifest.json'].flatMap(file => JSON.parse(fs.readFileSync(file,'utf8')));
fs.writeFileSync('miniprogram/fortress/level-assets-manifest.ts',"import type { VisualAsset } from './types';\nexport const LEVEL_ASSETS: readonly (VisualAsset & { readonly sha256?: string })[] = " + JSON.stringify(assets,null,2) + ';\n');
