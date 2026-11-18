// Builds the LPC avatar parts for the web version: node rework-play/art/lpc/build-lpc.cjs
// Downloads sprite sheets from the Universal LPC Spritesheet Character Generator, takes the standing frame facing the viewer
// (walk sheet, row 3, frame 1), crops a bust, recolours shirt / hair / ears with the generator's palettes, and writes small PNGs
// to rework-play/art/lpc/parts/, plus parts.json (what exists) and CREDITS.md (artists and licenses from the sheet definitions).
// Only layers offered under CC0, OGA-BY or CC-BY are used, so nothing here is share-alike.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { PNG } = require('pngjs');

const REPO = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/';
const OUT = path.join(__dirname, 'parts'), CACHE = path.join(os.tmpdir(), 'court-lpc-cache');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });

const CROP = { x: 12, y: 8, w: 40, h: 40 };          // bust inside the 64x64 frame
// body types: key -> LPC body and head. Teens get either head. Each key gets its own skin, face, coat, pants, cravat and chain layers.
const BODIES = { male: ['male', 'male'], female: ['female', 'female'], muscular: ['muscular', 'male'], teen_m: ['teen', 'male'], teen_f: ['teen', 'female'] };
const SHIRTS = ['black'];                                                         // a black coat, white cravat and black pants; released demons wear nothing. The seat's colour is the avatar's frame
const HAIRCOL = ['black', 'white', 'red', 'orange', 'blonde', 'chestnut'];       // hair and wolf ears (chestnut = brown); wings have their own colours
const HAIRS = { page: 'short', wavy: 'long', princess: 'xlong', sara: 'xlong' };                 // style -> folder in sheet_definitions/hair/
// eye colours: the head's blue iris (light, mid, dark) recoloured; the white of the eye stays
const IRIS = ['#57cee4', '#5686ae', '#2a3c49'];
const EYES = { red: ['#ff6b5e', '#c0242a', '#5a0d12'], gold: ['#ffe27a', '#d4a017', '#6b4c08'], black: ['#6e6a72', '#2b282e', '#0e0c10'] };
const WINGS = { bat: 'black', feathered: 'white' };                              // wing colours
const MASKS = ['black', 'maroon', 'gold', 'sky', 'forest'];                        // Archduke Duke Prince Marquis Earl

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
// HSL lightness of a #rrggbb colour, 0..1
const light = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return (Math.max(...v) + Math.min(...v)) / 2; };
// split a body into skin (pixels in the skin ramp, as grey = their lightness; the page tints it with an SVG filter) and the rest (eyes).
// The body keeps LPC's own shading.
const CHIN = 24;   // crop row where the torso starts (widen() looks for the hands below it)
function splitSkin(png, ramp) {
  const grey = new Map(ramp.map(c => [hex(c), Math.round(255 * light(c))]));
  const skin = blank(), rest = blank();
  for (let i = 0; i < png.data.length; i += 4) {
    if (!png.data[i + 3]) continue;
    const c = '#' + [0, 1, 2].map(k => png.data[i + k].toString(16).padStart(2, '0')).join(''), g = grey.get(c);
    const o = g === undefined ? rest : skin;
    for (let k = 0; k < 3; k++) o.data[i + k] = g === undefined ? png.data[i + k] : g;
    o.data[i + 3] = png.data[i + 3];
  }
  return { skin, rest };
}
// the muscular body has no long-sleeve shirt: stretch the male one sideways over the broader body, row by row,
// copying the shirt's edge pixel outward, above the rows where the male body's hands show below the sleeves
function widen(shirt, maleBody, body) {
  const o = PNG.sync.read(PNG.sync.write(shirt)), A = (p, x, y) => x >= 0 && x < CROP.w && p.data[(y * CROP.w + x) * 4 + 3];
  let hands = CROP.h;
  for (let y = CHIN; y < CROP.h && hands === CROP.h; y++) for (let x = 0; x < CROP.w; x++) if (A(maleBody, x, y) && !A(shirt, x, y) && (x < 12 || x > 27)) { hands = y; break; }
  for (let y = 0; y < hands; y++) {
    const xs = []; for (let x = 0; x < CROP.w; x++) if (A(shirt, x, y)) xs.push(x);
    if (!xs.length) continue;
    const L = Math.min(...xs), R = Math.max(...xs);
    for (const [from, step] of [[L, -1], [R, 1]]) for (let x = from + step; A(body, x, y) && !A(o, x, y); x += step) {
      const s = (y * CROP.w + from) * 4, d = (y * CROP.w + x) * 4; for (let k = 0; k < 4; k++) o.data[d + k] = shirt.data[s + k];
    }
  }
  return o;
}
const blank = () => { const p = new PNG({ width: CROP.w, height: CROP.h }); p.data.fill(0); return p; };
const save = (name, png) => fs.writeFileSync(path.join(OUT, name + '.png'), PNG.sync.write(png));
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
    horns: await def('head/appendages/head_horns_backwards.json'), curled: await def('head/appendages/head_horns_curled.json'),
    ears: await def('head/furry_ears/top/head_ears_wolf.json'), bat: await def('body/wings/wings_bat.json'), feathered: await def('body/wings/wings_feathered.json'),
    chain: await def('headwear/neck/neck_necklace_chain.json'), cravat: await def('headwear/neck/neck_cravat.json'), pants: await def('legs/pants/legs_pants.json'),
  };
  const parts = { bodies: Object.keys(BODIES), skinRamp: pal.body.light.map(light), shirts: SHIRTS, hairs: [], hairColors: HAIRCOL, eyes: Object.keys(EYES), masks: MASKS, crop: CROP };

  // per body type: skin_<key> (grey, tinted in the page), face_<key>_<eyes> (the eyes), coat, pants, cravat and chain
  const maleBody = await frame('spritesheets/' + D.body.layer_1.male + 'walk.png'), maleShirt = await frame('spritesheets/' + D.shirt.layer_1.male + 'walk.png');
  for (const [sex, [bt, ht]] of Object.entries(BODIES)) {
    const b = await frame('spritesheets/' + D.body.layer_1[bt] + 'walk.png'), h = await frame('spritesheets/' + D.head[ht].layer_1[bt] + 'walk.png');
    use(D.body, D.body.layer_1[bt]); use(D.head[ht], D.head[ht].layer_1[bt]);
    const { skin, rest } = splitSkin(over(b, h), pal.body.light);
    save(`skin_${sex}`, skin);
    for (const [e, ramp] of Object.entries(EYES)) save(`face_${sex}_${e}`, recolor(PNG.sync.read(PNG.sync.write(rest)), IRIS, ramp));
    const shirt = D.shirt.layer_1[bt] ? await frame('spritesheets/' + D.shirt.layer_1[bt] + 'walk.png') : widen(maleShirt, maleBody, b); use(D.shirt, D.shirt.layer_1[bt] || D.shirt.layer_1.male);
    for (const c of SHIRTS) save(`shirt_${sex}_${c}`, recolor(PNG.sync.read(PNG.sync.write(shirt)), pal.cloth.white, pal.cloth[c]));
    { const rel = D.pants.layer_1[bt] + 'walk.png'; save(`pants_${sex}`, recolor(await frame('spritesheets/' + rel), pal.cloth.white, pal.cloth.black)); use(D.pants, D.pants.layer_1[bt]); }   // black pants: the bottom of the bust shows the hips
    for (const c of ['white']) { const rel = D.cravat.layer_1.male + `walk/${c}.png`; save(`cravat_${sex}_${c}`, await frame('spritesheets/' + rel)); use(D.cravat, D.cravat.layer_1.male); }   // the thin (female) cravat has no white; the full one fits both
    { const rel = D.chain.layer_1[bt] + 'walk/iron.png'; save(`chain_${sex}_iron`, await frame('spritesheets/' + rel)); use(D.chain, D.chain.layer_1[bt]); }   // slaves
  }
  // hair: styles offered under CC0 / OGA-BY / CC-BY only
  for (const [h, dir] of Object.entries(HAIRS)) {
    const d = await def(`hair/${dir}/hair_${h}.json`).catch(() => null);
    if (!d) { console.log('skip hair', h); continue; }
    const ok = d.credits.every(c => c.licenses.some(l => /^(CC0|OGA-BY|CC-BY [34])/.test(l)));
    if (!ok) { console.log('skip (share-alike only)', h); continue; }
    let f; try { f = await frame('spritesheets/' + d.layer_1.male + 'walk.png'); } catch (e) { console.log('skip', h, e.message); continue; }
    use(d, d.layer_1.male); parts.hairs.push(h);
    for (const c of HAIRCOL) save(`hair_${h}_${c}`, recolor(PNG.sync.read(PNG.sync.write(f)), pal.hair.orange, pal.hair[c]));
    if (d.layer_2) {   // long hair also hangs behind the body: hairback_<style>_<colour>, drawn under everything
      const b = await frame('spritesheets/' + d.layer_2.male + 'walk.png'); use(d, d.layer_2.male);
      for (const c of HAIRCOL) save(`hairback_${h}_${c}`, recolor(PNG.sync.read(PNG.sync.write(b)), pal.hair.orange, pal.hair[c]));
    }
  }
  // masks (one colour per role), horns, wolf ears (in the hair colour) and wings (black bat, white feathered)
  for (const m of MASKS) { const rel = D.mask.layer_1.male + 'walk/' + m + '.png'; save(`mask_${m}`, await frame('spritesheets/' + rel)); use(D.mask, D.mask.layer_1.male); }
  save('horns_straight', await frame('spritesheets/' + D.horns.layer_1.male + 'walk.png')); use(D.horns, D.horns.layer_1.male);
  save('horns_curved', await frame('spritesheets/' + D.curled.layer_1.male + 'walk.png')); use(D.curled, D.curled.layer_1.male);
  const ears = await frame('spritesheets/' + D.ears.layer_1.male + 'walk.png'); use(D.ears, D.ears.layer_1.male);
  for (const c of HAIRCOL) save(`ears_${c}`, recolor(PNG.sync.read(PNG.sync.write(ears)), pal.hair.orange, pal.hair[c]));
  for (const [w, c] of Object.entries(WINGS)) {   // the back layer: facing the viewer, wings sit behind the body
    const rel = D[w].layer_2.male + 'walk/' + c + '.png'; save(`wings_${w}`, await frame('spritesheets/' + rel)); use(D[w], D[w].layer_2.male);
  }
  fs.writeFileSync(path.join(OUT, 'parts.json'), JSON.stringify(parts, null, 1));

  // credits
  let md = '# LPC avatar credits\n\nAvatar parts in `parts/` are cut from the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) (Liberated Pixel Cup art). Each piece below is used under the first non-share-alike license it offers (CC0, OGA-BY 3.0 or CC-BY); the full list of licenses each artist offers is shown. Recolouring uses the generator\'s palettes. Built by `build-lpc.cjs`.\n';
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
