// Original vector geometry shared with the in-game 3D room. Run with node --import tsx.
import {readFileSync,writeFileSync} from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
import {WEAPONS} from '../miniprogram/weapons/catalog';
import {weaponAppearance,weaponMaterial} from '../miniprogram/weapons/appearance';
const hero = readFileSync('docs/assets/original/hero-back.svg','utf8');
const cards:string[]=[];
for(const weapon of WEAPONS) {
 const design=weaponAppearance(weapon.level);
 const shapes=design.parts.map(part=>{
  const color=weaponMaterial(part,weapon.color,design.light);
  const bevel=Math.min(8,part.w/4,part.h/4);
  const shape=part.round
    ? `<ellipse cx="${part.x+part.w/2}" cy="${part.y+part.h/2}" rx="${part.w/2}" ry="${part.h/2}" fill="${color}"/>`
    : `<path d="M${part.x+bevel} ${part.y}h${part.w-2*bevel}l${bevel} ${bevel}v${part.h-2*bevel}l-${bevel} ${bevel}h${2*bevel-part.w}l-${bevel}-${bevel}v${2*bevel-part.h}z" fill="${color}"/>`;
  const trim=part.material==='light'?'':`<path d="M${part.x+10} ${part.y+6}h${Math.max(0,part.w-20)}" stroke="#ffffff" stroke-opacity=".4" stroke-width="3"/>`;
  return shape+trim;
 }).join('');
 const body=`<g stroke="#213643" stroke-width="5" stroke-linejoin="round">${shapes}</g>`;
 const glow=`<g opacity=".24" fill="${design.light}"><ellipse cx="350" cy="150" rx="235" ry="100"/></g>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">${weapon.level>=4?glow:''}<ellipse cx="310" cy="285" rx="225" ry="9" fill="#20343f" opacity=".12"/>${body}</svg>`;
 writeFileSync(`miniprogram/assets/weapons/weapon-${weapon.level}.svg`,svg);
 writeFileSync(`miniprogram/assets/weapons/weapon-${weapon.level}.png`,new Resvg(svg).render().asPng());
 // Replace only the old vector gun; retain the original guardian artwork.
 const equipped=hero.replace(/<rect x="102"[\s\S]*?(?=<path d="M55 42)/,
   `<g transform="translate(111 97) rotate(-90) scale(.16)">${body}</g>\n`);
 writeFileSync(`docs/assets/original/hero-back-weapon-${weapon.level}.svg`,equipped);
 writeFileSync(`miniprogram/assets/images/fortress/hero-back-weapon-${weapon.level}.png`,new Resvg(equipped).render().asPng());
 cards.push(`<g transform="translate(${(weapon.level-1)%2*640} ${Math.floor((weapon.level-1)/2)*380})"><text x="36" y="30" fill="#ffffff" font-size="22">LEVEL ${weapon.level}</text><g transform="translate(0 40)">${body}</g></g>`);
}
const sheet=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1520"><rect width="100%" height="100%" fill="#142536"/>${cards.join('')}</svg>`;
writeFileSync('/tmp/word-monster-weapon-lineup.png',new Resvg(sheet).render().asPng());
