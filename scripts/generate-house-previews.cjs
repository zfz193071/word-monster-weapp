// Render the real home geometry into small transparent upgrade previews.
// Run: node --import tsx scripts/generate-house-previews.cjs
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const { HomeRoomScene } = require('../miniprogram/home/room-scene.ts');
const output = join(__dirname, '../miniprogram/assets/images/houses');
mkdirSync(output, {recursive:true});
for(let level=1; level<=5; level++) {
  let shapes=[], path='', x=0, y=0, stack=[];
  const context={fillStyle:'#000', globalAlpha:1,
    setTransform(){x=0;y=0;}, clearRect(){shapes=[];}, save(){stack.push([x,y]);}, restore(){[x,y]=stack.pop();}, translate(dx,dy){x+=dx;y+=dy;},
    beginPath(){path='';}, moveTo(px,py){path+=`M${px+x},${py+y}`;}, lineTo(px,py){path+=`L${px+x},${py+y}`;}, closePath(){path+='Z';},
    fill(){shapes.push(`<path d="${path}" fill="${this.fillStyle}" opacity="${this.globalAlpha}"/>`);}, stroke(){},
  };
  const scene=new HomeRoomScene({getContext:()=>context},480,460,1);
  scene.setHouseLevel(level);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="460">${shapes.join('')}</svg>`;
  writeFileSync(join(output,`house-${level}.png`),new Resvg(svg).render().asPng());
  scene.dispose();
}
