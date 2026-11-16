// Builds the LPC avatar parts for the web version: node rework-play/art/lpc/build-lpc.cjs
// Downloads sprite sheets from the Universal LPC Spritesheet Character Generator, takes the standing frame facing the viewer
// (walk sheet, row 3, frame 1), crops a bust, recolours skin / shirt / hair with the generator's palettes, and writes small PNGs
// to rework-play/art/lpc/parts/, plus parts.json (what exists) and CREDITS.md (artists and licenses from the sheet definitions).
// Only layers offered under CC0, OGA-BY or CC-BY are used, so nothing here is share-alike.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { PNG } = require('pngjs');

const REPO = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/';
const OUT = path.join(__dirname, 'parts'), CACHE = path.join(os.tmpdir(), 'court-lpc-cache');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });

const CROP = { x: 12, y: 8, w: 40, h: 40 };          // bust inside the 64x64 frame
const SEXES = ['male', 'female'];
const SKINS = ['light', 'amber', 'bronze', 'lavender', 'blue', 'pale_green', 'zombie', 'taupe'];
const SHIRTS = ['red', 'blue', 'green', 'orange', 'purple', 'teal'];            // player colours: Crimson Cobalt Emerald Amber Violet Teal
const HAIRCOL = ['black', 'raven', 'dark_brown', 'chestnut', 'white', 'ash', 'red', 'purple', 'blue', 'platinum'];
const HAIRS = ['bob', 'afro', 'lob', 'idol', 'curly_short', 'spiked', 'long_straight', 'natural', 'cowlick', 'dreadlocks_short'];
const MASKS = ['gold', 'red', 'purple', 'blue', 'green'];                        // Archduke Duke Prince Marquis Earl

async function get(rel, json) {
  const f = path.join(CACHE, rel.replace(/\//g, '__'));
  if (!fs.existsSync(f)) {
    const r = await fetch(REPO + rel, { headers: { 'User-Agent': 'court-playtest' } });
    if (!r.ok) throw new Error(`${r.status} ${rel}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return json ? JSON.parse(fs.readFileSync(f, 'utf8')) : PNG.sync.read(fs.readFileSync(f));
}
// the standing frame facing the viewer, cropped to a bust
async function frame(rel) {
  const sheet = await get(rel);
  const o = new PNG({ width: CROP.w, height: CROP.h }); o.data.fill(0);
  PNG.bitblt(sheet, o, CROP.x, 128 + CROP.y, CROP.w, CROP.h, 0, 0);
  return o;
}
const hex = c => c.toLowerCase();
function recolor(png, from, to) {
  const map = new Map(from.map((c, i) => [hex(c), to[i]]));
  for (let i = 0; i < png.data.length; i += 4) {
    if (!png.data[i + 3]) continue;
    const c = '#' + [0, 1, 2].map(k => png.data[i + k].toString(16).padStart(2, '0')).join('');
    const t = map.get(c); if (!t) continue;
    for (let k = 0; k < 3; k++) png.data[i + k] = parseInt(t.slice(1 + 2 * k, 3 + 2 * k), 16);
  }
  return png;
}
function over(dst, src) {
  for (let i = 0; i < dst.data.length; i += 4) {
    const a = src.data[i + 3] / 255; if (!a) continue;
    for (let k = 0; k < 3; k++) dst.data[i + k] = Math.round(src.data[i + k] * a + dst.data[i + k] * (1 - a));
    dst.data[i + 3] = Math.max(dst.data[i + 3], src.data[i + 3]);
  }
  return dst;
}
const blank = () => { const p = new PNG({ width: CROP.w, height: CROP.h }); p.data.fill(0); return p; };
const save = (name, png) => fs.writeFileSync(path.join(OUT, name + '.png'), PNG.sync.write(png));
// pixel art drawn for Court (CC0), in 64x64 frame coordinates
function pixels(rows, colors) {
  const p = blank();
  for (const [x, y, c] of rows) {
    const X = x - CROP.x, Y = y - CROP.y, i = (Y * CROP.w + X) * 4, h = colors[c];
    for (let k = 0; k < 3; k++) p.data[i + k] = parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
    p.data[i + 3] = 255;
  }
  return p;
}
const INK = '#2b2118', GOLD = '#e0b040', GOLDD = '#8a6a1a', GEM = '#7b3fb0', WHITE = '#fff8e6', RED = '#b8323a';

(async () => {
  const defs = {};
  const def = async (rel) => (defs[rel] = defs[rel] || await get('sheet_definitions/' + rel, true));
  const used = new Map();   // definition -> files used (for credits)
  const use = (d, file) => { const k = d.name; if (!used.has(k)) used.set(k, { d, files: new Set() }); used.get(k).files.add(file); };
  const pal = {
    body: await get('palette_definitions/body/body_ulpc.json', true),
    cloth: await get('palette_definitions/cloth/cloth_ulpc.json', true),
    hair: await get('palette_definitions/hair/hair_ulpc.json', true),
  };
  const D = {
    body: await def('body/body.json'), head: { male: await def('head/heads/human/heads_human_male.json'), female: await def('head/heads/human/heads_human_female.json') },
    shirt: await def('torso/shirts/longsleeve/torso_clothes_longsleeve.json'), mask: await def('headwear/accessories/facial_mask_plain.json'),
    horns: await def('head/appendages/head_horns_backwards.json'), helm: await def('headwear/helmets/helmets/hat_helmet_nasal.json'),
    chain: await def('headwear/neck/neck_necklace_chain.json'), earrings: await def('headwear/accessories/earrings/facial_earrings_stud.json'),
  };
  const parts = { sexes: SEXES, skins: SKINS, shirts: SHIRTS, hairs: [], hairColors: HAIRCOL, masks: MASKS, crop: CROP };

  // body + head per sex and skin
  for (const sex of SEXES) {
    const b = await frame('spritesheets/' + D.body.layer_1[sex] + 'walk.png'), h = await frame('spritesheets/' + D.head[sex].layer_1[sex] + 'walk.png');
    use(D.body, D.body.layer_1[sex]); use(D.head[sex], D.head[sex].layer_1[sex]);
    for (const skin of SKINS) {
      const base = over(PNG.sync.read(PNG.sync.write(b)), h);
      save(`base_${sex}_${skin}`, recolor(base, pal.body.light, pal.body[skin]));
    }
    const shirt = await frame('spritesheets/' + D.shirt.layer_1[sex] + 'walk.png'); use(D.shirt, D.shirt.layer_1[sex]);
    for (const c of SHIRTS) save(`shirt_${sex}_${c}`, recolor(PNG.sync.read(PNG.sync.write(shirt)), pal.cloth.white, pal.cloth[c]));
    for (const metal of ['gold', 'iron']) { const rel = D.chain.layer_1[sex] + 'walk/' + metal + '.png'; save(`chain_${sex}_${metal}`, await frame('spritesheets/' + rel)); use(D.chain, D.chain.layer_1[sex]); }
    const ear = D.earrings.layer_1[sex] + 'walk/gold.png'; save(`earrings_${sex}`, await frame('spritesheets/' + ear)); use(D.earrings, D.earrings.layer_1[sex]);
  }
  // hair: styles offered under CC0 / OGA-BY / CC-BY only
  for (const h of HAIRS) {
    const d = await def(`hair/${({ bob: 'bob', lob: 'bob', afro: 'afro', natural: 'afro', dreadlocks_short: 'afro', idol: 'short', curly_short: 'curly', spiked: 'short', long_straight: 'long', cowlick: 'short' })[h]}/hair_${h}.json`).catch(() => null);
    if (!d) { console.log('skip hair', h); continue; }
    const ok = d.credits.every(c => c.licenses.some(l => /^(CC0|OGA-BY|CC-BY [34])/.test(l)));
    if (!ok) { console.log('skip (share-alike only)', h); continue; }
    let f; try { f = await frame('spritesheets/' + d.layer_1.male + 'walk.png'); } catch (e) { console.log('skip', h, e.message); continue; }
    use(d, d.layer_1.male); parts.hairs.push(h);
    for (const c of HAIRCOL) save(`hair_${h}_${c}`, recolor(PNG.sync.read(PNG.sync.write(f)), pal.hair.orange, pal.hair[c]));
  }
  // masks, horns, helm
  for (const m of MASKS) { const rel = D.mask.layer_1.male + 'walk/' + m + '.png'; save(`mask_${m}`, await frame('spritesheets/' + rel)); use(D.mask, D.mask.layer_1.male); }
  save('horns', await frame('spritesheets/' + D.horns.layer_1.male + 'walk.png')); use(D.horns, D.horns.layer_1.male);
  save('helm', await frame('spritesheets/' + D.helm.layer_1.male + 'walk.png')); use(D.helm, D.helm.layer_1.male);
  // drawn for Court: third eye (Archduke) and circlet (Prince)
  save('thirdeye', pixels([[31, 24, 'k'], [32, 24, 'k'], [33, 24, 'k'], [30, 25, 'k'], [31, 25, 'w'], [32, 25, 'r'], [33, 25, 'w'], [34, 25, 'k'], [31, 26, 'k'], [32, 26, 'k'], [33, 26, 'k']], { k: INK, w: WHITE, r: RED }));
  const circ = [];
  for (let x = 23; x <= 41; x++) { circ.push([x, 21, 'g'], [x, 22, 'd']); }
  for (const x of [25, 29, 35, 39]) circ.push([x, 20, 'g']);
  for (const x of [32]) circ.push([x, 20, 'g'], [x, 19, 'g'], [x, 18, 'g']);
  circ.push([31, 21, 'p'], [32, 21, 'p'], [33, 21, 'p'], [32, 20, 'p']);
  save('circlet', pixels(circ, { g: GOLD, d: GOLDD, p: GEM }));
  fs.writeFileSync(path.join(OUT, 'parts.json'), JSON.stringify(parts, null, 1));

  // credits
  let md = '# LPC avatar credits\n\nAvatar parts in `parts/` are cut from the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) (Liberated Pixel Cup art). Each piece below is used under the first non-share-alike license it offers (CC0, OGA-BY 3.0 or CC-BY); the full list of licenses each artist offers is shown. Recolouring uses the generator\'s palettes. Built by `build-lpc.cjs`.\n\nThe third eye and circlet were drawn for Court and are CC0.\n';
  for (const { d, files } of used.values()) {
    md += `\n## ${d.name}\n\n`;
    for (const c of d.credits) {
      if (![...files].some(f => f.startsWith(c.file) || c.file.startsWith(f.replace(/\/$/, '')))) continue;
      md += `- \`${c.file}\`: ${c.authors.join(', ')}. Licenses: ${c.licenses.join(', ')}.${c.notes ? ' ' + c.notes : ''}\n${c.urls.map(u => `  - ${u}`).join('\n')}\n`;
    }
  }
  fs.writeFileSync(path.join(__dirname, 'CREDITS.md'), md);
  console.log('parts', fs.readdirSync(OUT).length, 'hair styles', parts.hairs.join(','));
})().catch(e => { console.error(e); process.exit(1); });
