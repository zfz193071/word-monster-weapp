// Rasterize attributed OpenMoji icons and project-original diagrams into compact card/cover assets.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require(process.env.RESVG_MODULE || '@resvg/resvg-js');
const categories = JSON.parse(fs.readFileSync('docs/level-word-source.json','utf8'));
const mapping = {
 bear:'1F43B',bee:'1F41D',bird:'1F426',cat:'1F408',chicken:'1F414',cow:'1F404',dog:'1F415',duck:'1F986',elephant:'1F418',fish:'1F41F',horse:'1F40E',lion:'1F981',panda:'1F43C',rabbit:'1F407',sheep:'1F411',tiger:'1F405',
 book:'1F4D6',clock:'1F552',computer:'1F5A5',pen:'1F58A',pencil:'270F',ruler:'1F4CF',blackboard:null,eraser:null,paper:'1F4C4',scissors:'2702',notebook:'1F4D3',glue:null,tape:null,sharpener:null,
 bed:'1F6CF',desk:null,door:'1F6AA',chair:'1FA91',floor:null,wall:null,ceiling:null,
 bag:'1F45C',bike:'1F6B2',bread:'1F35E',cake:'1F370',candle:'1F56F',candy:'1F36C',clothes:'1F455',cup:'2615',doll:null,home:'1F3E0',boat:'1F6F6',kite:'1FA81',gift:'1F381',towel:null,window:'1FA9F',glass:null,juice:'1F9C3',toy:'1F9F8',
 air:null,earth:'1F30D',fire:'1F525',moon:'1F319',rain:'1F327',sea:null,season:null,snow:'1F328',star:'2B50',sun:'2600',weather:null,wind:'1F32C',
 hand:'270B',head:null,leg:'1F9B5',body:null,arm:'1F4AA',palm:null,forehead:null,
};
const colors={black:'#30363d',blue:'#408acc',brown:'#9a6949',green:'#62a65a',pink:'#ed98b2',red:'#dc5857',white:'#ffffff',yellow:'#f1cd55'};
const rect=(x,y,w,h,fill,r=5)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const line=(x1,y1,x2,y2,color='#40574d',width=3)=>`<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const face=circle(50,34,19,'#e9b68d')+`<path d="M31 31 Q30 10 50 13 Q71 12 69 32 L64 23 Q46 29 35 24 Z" fill="#60594d"/>`+circle(43,34,2,'#40574d')+circle(57,34,2,'#40574d')+`<path d="M43 43 Q50 48 57 43" fill="none" stroke="#a36d5a" stroke-width="2"/>`;
const person=face+rect(33,54,34,30,'#75a99b')+line(32,58,23,78,'#e9b68d',9)+line(68,58,77,78,'#e9b68d',9)+line(41,84,39,96,'#537467',9)+line(59,84,61,96,'#537467',9);
const room=`<path d="M15 25 L65 14 L85 32 L85 76 L35 91 L15 72 Z" fill="#dae6da" stroke="#6b8979" stroke-width="2"/>`+`<path d="M15 72 L65 56 L85 76 L35 91 Z" fill="#b9c4a6"/>`+line(65,14,65,56,'#92aa98',2);
const wave=`<path d="M10 40 Q20 25 30 40 T50 40 T70 40 T90 40 M10 58 Q20 43 30 58 T50 58 T70 58 T90 58 M10 76 Q20 61 30 76 T50 76 T70 76 T90 76" fill="none" stroke="#559eb5" stroke-width="7"/>`;
const art={
 blackboard:rect(10,18,80,52,'#ab8964')+rect(15,23,70,42,'#467466')+line(22,78,27,70)+line(78,78,73,70)+line(23,37,48,37,'#fff3d4',3)+line(23,49,66,49,'#fff3d4',3),
 eraser:`<path d="M17 61 L40 27 L84 44 L62 78 L30 78 Z" fill="#d68894" stroke="#536b61" stroke-width="2"/><path d="M40 27 L61 35 L37 72 L17 61 Z" fill="#ede3bf"/>`,
 glue:rect(31,35,38,48,'#f1d99e')+rect(35,23,30,15,'#d57c68')+rect(42,12,16,14,'#d57c68')+rect(36,51,28,15,'#fff6da'),
 tape:circle(50,49,32,'#dbbd80')+circle(50,49,15,'#fff7df')+`<path d="M72 38 L89 72 L70 80 L61 61" fill="#dbbd80"/>`,
 sharpener:rect(20,26,62,48,'#76acaf',10)+circle(41,50,13,'#405f66')+circle(41,50,7,'#e1dfc8')+rect(64,32,9,35,'#dfe5da',2),
 desk:rect(11,32,78,12,'#c39564')+rect(17,44,8,41,'#967351')+rect(75,44,8,41,'#967351')+rect(48,47,29,16,'#dab484')+circle(62,55,2,'#775e43'),
 floor:room+`<path d="M15 72 L65 56 L85 76 L35 91 Z" fill="#edbb68" stroke="#a67546" stroke-width="2"/>`,
 wall:room+`<path d="M15 25 L65 14 L65 56 L15 72 Z" fill="#edbb68" stroke="#a67546" stroke-width="2"/>`,
 ceiling:room+`<path d="M15 25 L65 14 L85 32 L35 45 Z" fill="#edbb68" stroke="#a67546" stroke-width="2"/>`,
 doll:person+circle(31,23,8,'#a78355')+circle(69,23,8,'#a78355'),
 towel:rect(18,16,64,67,'#8bb6b9',6)+rect(24,16,14,67,'#a9ced0',2)+line(22,72,78,72,'#fff8df')+line(22,78,78,78,'#fff8df'),
 glass:`<path d="M25 20 L76 12 L76 78 L25 89 Z" fill="#c7e7e6" fill-opacity=".7" stroke="#688e92" stroke-width="3"/><path d="M30 66 L68 22 L68 37 L30 81 Z M30 44 L51 20 L61 18 L30 55 Z" fill="white" fill-opacity=".85"/>`,
 air:`<path d="M15 40 H70 Q88 40 85 28 Q80 16 70 24 M25 55 H80 M15 69 H60 Q80 69 75 81 Q70 90 60 82" stroke="#80acb6" stroke-width="6" fill="none" stroke-linecap="round"/>`,
 sea:wave+circle(76,16,9,'#e9c260'),
 season:circle(30,30,20,'#a7ca83')+circle(70,30,20,'#edd27a')+circle(30,70,20,'#dc9e63')+circle(70,70,20,'#a6cdd3')+line(30,40,30,20,'#687d4c')+circle(70,30,10,'#e5a649')+`<path d="M20 71 Q32 49 40 68 Q34 83 20 71Z" fill="#a96444"/>`+line(60,70,80,70,'white')+line(70,60,70,80,'white'),
 snow:null,weather:circle(34,30,19,'#ebc861')+circle(53,49,21,'#9dc0c8')+circle(73,53,15,'#9dc0c8')+line(42,76,38,86,'#5e99b3')+line(62,76,58,86,'#5e99b3'),
 head:face,body:person,
 palm:`<path d="M31 85 Q20 70 20 54 Q20 44 28 49 L32 56 L32 23 Q32 15 39 20 L41 43 L43 15 Q45 9 51 15 L52 42 L57 20 Q64 14 66 24 L63 48 L71 31 Q79 27 79 38 L71 71 Q66 88 51 90 Z" fill="#e9b68d" stroke="#a0775b" stroke-width="2"/>`+circle(49,65,13,'#f5d793')+line(39,61,56,57,'#b28563',2)+line(41,70,56,73,'#b28563',2),
 forehead:face+rect(36,25,28,6,'#efd462',2)+line(78,26,66,27,'#b86f4e',3),
};
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 100 100">${body}</svg>`;
const dir='miniprogram/learning-assets/images'; const coverDir='miniprogram/assets/images/levels'; fs.mkdirSync(coverDir,{recursive:true}); const originals='docs/assets/levels'; fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(originals,{recursive:true});
const manifest=[];
if(process.argv.includes('--list')) { console.log(JSON.stringify([...new Set(Object.values(mapping).filter(Boolean))]));process.exit(0); }
for(const category of categories) for(const word of category.words) {
 let source,rights,markup;
 if(colors[word.id]) { markup=svg(circle(50,50,34,colors[word.id])+`<circle cx="50" cy="50" r="34" fill="none" stroke="#93a095" stroke-width="2"/>`+`<path d="M28 36 Q36 23 49 24" fill="none" stroke="#ffffff88" stroke-width="6" stroke-linecap="round"/>`);source=`${originals}/${word.id}.svg`;rights='本项目原创矢量图'; }
 else if(mapping[word.id]) { markup=fs.readFileSync(path.join(process.env.OPENMOJI_DIR || '/private/tmp/wm-level-openmoji',mapping[word.id]+'.svg'),'utf8');source=`https://github.com/hfg-gmuend/openmoji/blob/17.0.0/color/svg/${mapping[word.id]}.svg`;rights='OpenMoji contributors；CC BY-SA 4.0；SVG转PNG，未改变图案；https://creativecommons.org/licenses/by-sa/4.0/'; }
 else { if(!art[word.id])throw Error('Missing art '+word.id);markup=svg(art[word.id]);source=`${originals}/${word.id}.svg`;rights='本项目原创矢量图'; }
 fs.writeFileSync(`${originals}/${word.id}.svg`,markup);
 fs.writeFileSync(`${dir}/${word.id}.png`,new Resvg(markup,{font:{loadSystemFonts:false},fitTo:{mode:'width',value:192}}).render().asPng());
 manifest.push({wordId:word.id,path:`/learning-assets/images/${word.id}.png`,kind:'image',source,rights,reviewStatus:'pending'});
}
const covers=['apple','blue','dog','book','bed','kite','sun','hand'];
const backgrounds=['#d7e8a9','#c5dbec','#dce7bd','#d3dfd5','#efddbd','#eed4bc','#c4dfdf','#e9cfc0'];
for(let i=0;i<8;i++) {
 const file=i===0?'miniprogram/fruit-assets/apple.png':`${dir}/${covers[i]}.png`;
 const encoded=fs.readFileSync(file).toString('base64');
 const cover=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${backgrounds[i]}"/><circle cx="160" cy="90" r="77" fill="#ffffff60"/><path d="M0 176 Q80 125 160 171 T320 160 V200 H0" fill="#ffffff55"/><circle cx="47" cy="44" r="7" fill="#fff6"/><circle cx="280" cy="120" r="11" fill="#fff6"/><image href="data:image/png;base64,${encoded}" x="85" y="18" width="150" height="150"/></svg>`;
 fs.writeFileSync(`${coverDir}/cover-${i+1}.png`,new Resvg(cover,{font:{loadSystemFonts:false}}).render().asPng());
 manifest.push({wordId:`level-${i+1}`,path:`/assets/images/levels/cover-${i+1}.png`,kind:'image',source:'scripts/create-level-assets.cjs',rights:i<2?'本项目原创构图；第1关嵌入沿用CC0苹果，第2关原创色块':'本项目原创构图，嵌入OpenMoji；合成图沿用CC BY-SA 4.0；https://creativecommons.org/licenses/by-sa/4.0/',reviewStatus:'pending'});
}
const body=fs.readFileSync('docs/assets/original/zombie-body.svg','utf8');
for(const [word,color] of Object.entries(colors))fs.writeFileSync(`miniprogram/assets/images/fortress/zombie-body-${word}.png`,new Resvg(body.replaceAll('#a28a6e',color).replaceAll('#c2b08b',color).replaceAll('#d4c4a3',color),{font:{loadSystemFonts:false}}).render().asPng());
fs.writeFileSync('docs/level-image-manifest.json',JSON.stringify(manifest,null,2)+'\n');
