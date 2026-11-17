// Builds art/court-demon.json: a DiceBear 10 style definition forked from the CC0 "Lorelei" style,
// with a mask layer (over the eyes, coloured by role) and a role-feature layer (third eye, horns, circlet, helm, coins).
// Run from rework-play/art with @dicebear/styles installed:  node build-avatar-style.mjs <path to lorelei.min.json> <path to carnival-mask.svg>
import fs from 'fs';

const [, , loreleiPath, maskSvgPath] = process.argv;
const def = JSON.parse(fs.readFileSync(loreleiPath, 'utf8'));
const maskPath = (fs.readFileSync(maskSvgPath, 'utf8').match(/<path(?![^>]*M0 0h512v512H0z)[^>]* d="([^"]+)"/) || [])[1];
if (!maskPath) throw new Error('mask path not found');

const OUT = { type: 'color', name: 'outline' };
const el = (name, attributes) => ({ name, type: 'element', attributes });

def.$id = 'court-demon';
def.$comment = 'Court demon avatars: fork of the DiceBear "Lorelei" style (CC0) with a mask layer and role features.';
def.meta = { ...def.meta, license: { ...def.meta.license, text: def.meta.license.text + ' Masks and role features added for Court (CC0). Mask shape: "carnival-mask" by Delapouite, game-icons.net, CC BY 3.0.' } };

// faintly demonic skin tones
def.colors.skin = { notEqualTo: [], values: ['#f3e3d3', '#e8d0c4', '#ddc6d8', '#cfdccb', '#f0d9b5', '#d9c2b0'] };
// mask colours, one per role (Archduke, Duke, Prince, Marquis, Earl); the page picks one with maskColor
def.colors.mask = { notEqualTo: [], values: ['#b8862b', '#a3312a', '#6b3d8f', '#4d84b0', '#3b7a45'] };

// mask: over the eyes, in head coordinates (the head is 588 x 776; Lorelei's eyes sit at 159,232, 360 wide)
def.components.mask = {
  width: 588, height: 776, probability: 0,
  variants: { carnival: { elements: [el('path', { d: maskPath, transform: 'translate(134 70) scale(.79)', fill: { type: 'color', name: 'mask' }, stroke: OUT, 'stroke-width': '7' })] } },
};
for (const v of Object.values(def.components.head.variants)) v.elements.push({ name: 'mask', type: 'component', attributes: { transform: 'translate(0 0)' } });

// role features, also in head coordinates, drawn on top of the hair (the head sits at 207,171 on the 980 canvas)
const GOLD = '#c9a046', STEEL = '#9aa3ad';
def.components.feature = {
  width: 588, height: 776, probability: 0,
  variants: {
    // Archduke, knowledge: a third eye on the forehead
    thirdEye: { elements: [
      el('path', { d: 'M284 78Q339 30 394 78Q339 126 284 78Z', fill: '#fff8e6', stroke: OUT, 'stroke-width': '8' }),
      el('circle', { cx: '339', cy: '78', r: '17', fill: '#b8862b' }), el('circle', { cx: '339', cy: '78', r: '7', fill: '#000' }),
    ] },
    // Duke, war: horns
    horns: { elements: [
      el('path', { d: 'M170 40C112 6 92 -64 116 -116C130 -68 164 -32 218 -8Z', fill: '#a3312a', stroke: OUT, 'stroke-width': '8', 'stroke-linejoin': 'round' }),
      el('path', { d: 'M476 28C534 -6 556 -76 532 -124C518 -78 486 -46 432 -22Z', fill: '#a3312a', stroke: OUT, 'stroke-width': '8', 'stroke-linejoin': 'round' }),
    ] },
    // Prince, rule: a gold circlet with a gem
    circlet: { elements: [
      el('path', { d: 'M120 40L132 -40L208 14L272 -70L339 4L406 -70L470 14L546 -40L556 40Q339 86 120 40Z', fill: GOLD, stroke: OUT, 'stroke-width': '8', 'stroke-linejoin': 'round' }),
      el('circle', { cx: '339', cy: '30', r: '16', fill: '#6b3d8f', stroke: OUT, 'stroke-width': '6' }),
    ] },
    // Marquis, defence: a steel helm with a nose guard
    helm: { elements: [
      el('path', { d: 'M70 150C70 -60 190 -120 330 -120C470 -120 590 -60 590 150Q330 100 70 150Z', fill: STEEL, stroke: OUT, 'stroke-width': '9', 'stroke-linejoin': 'round' }),
      el('path', { d: 'M318 110L362 110L358 300L322 300Z', fill: STEEL, stroke: OUT, 'stroke-width': '8', 'stroke-linejoin': 'round' }),
      el('path', { d: 'M100 110Q330 64 560 110', stroke: OUT, 'stroke-width': '7', fill: 'none' }),
      el('circle', { cx: '170', cy: '96', r: '9', fill: '#000' }), el('circle', { cx: '490', cy: '96', r: '9', fill: '#000' }),
    ] },
    // Earl, economy: a gold coin earring and a coin chain
    coins: { elements: [
      el('circle', { cx: '58', cy: '450', r: '48', fill: GOLD, stroke: OUT, 'stroke-width': '8' }),
      el('circle', { cx: '58', cy: '450', r: '24', fill: 'none', stroke: OUT, 'stroke-width': '6' }),
      el('path', { d: 'M180 690Q339 790 498 690', stroke: GOLD, 'stroke-width': '12', fill: 'none' }),
      el('circle', { cx: '339', cy: '742', r: '40', fill: GOLD, stroke: OUT, 'stroke-width': '8' }),
    ] },
  },
};
def.canvas.elements.push({ name: 'feature', type: 'component', attributes: { transform: 'translate(207 171)' } });

fs.writeFileSync('court-demon.json', JSON.stringify(def));
console.log('wrote court-demon.json', Math.round(fs.statSync('court-demon.json').size / 1024) + ' KB');
