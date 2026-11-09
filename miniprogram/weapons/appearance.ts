// Shared silhouette geometry for the showroom, room model and battle sprite.
// Coordinates describe a side-on weapon pointing right; these are cosmetic only.
export interface WeaponPart { x: number; y: number; w: number; h: number; material: 'armor' | 'metal' | 'dark' | 'light'; round?: boolean }
export interface WeaponAppearance { title: string; light: string; parts: readonly WeaponPart[] }
const p = (x:number,y:number,w:number,h:number,material:WeaponPart['material']='armor',round=false):WeaponPart => ({x,y,w,h,material,round});
const designs: readonly WeaponAppearance[] = [
  {title:'轻巧短枪',light:'#e8f5ff',parts:[p(115,120,80,64,'metal'),p(190,105,180,80),p(215,175,45,65,'dark'),p(365,125,95,36,'metal'),p(450,118,25,50,'dark'),p(210,120,125,10,'light')]},
  {title:'双管守卫',light:'#8defff',parts:[p(75,125,100,65,'dark'),p(165,105,195,95),p(205,190,46,55,'metal'),p(345,105,155,28,'metal'),p(345,165,155,28,'metal'),p(480,95,35,48),p(480,155,35,48),p(250,135,80,27,'light')]},
  {title:'星瞳长枪',light:'#edc4ff',parts:[p(60,130,110,55),p(155,125,185,60),p(205,180,40,70,'dark'),p(330,135,205,20,'metal'),p(520,125,30,40,'dark'),p(215,75,105,30,'dark'),p(240,105,30,22,'metal'),p(305,78,20,24,'light'),p(345,130,55,30),p(180,140,125,8,'light')]},
  {title:'翡翠重炮',light:'#b5ff92',parts:[p(70,130,110,60,'dark'),p(165,100,140,105),p(210,195,50,55,'metal'),p(280,75,205,150),p(310,95,125,110,'dark'),p(325,108,95,84,'light',true),p(460,85,55,130,'metal'),p(495,100,28,100,'dark'),p(280,60,130,18,'metal')]},
  {title:'雷霆机炮',light:'#fff2a0',parts:[p(65,130,110,55,'metal'),p(160,105,150,100),p(195,195,45,50,'dark'),p(245,165,100,90,'dark',true),p(265,185,60,50,'light',true),p(300,90,200,25,'metal'),p(300,137,220,25,'metal'),p(300,184,200,25,'metal'),p(335,80,30,140),p(460,80,30,140),p(500,125,25,50,'dark'),p(175,125,100,18,'light')]},
  {title:'日冕轨道',light:'#8ffaff',parts:[p(70,130,95,55,'dark'),p(160,110,155,85),p(200,185,45,60,'metal'),p(295,75,235,35),p(295,185,235,35),p(310,112,150,14,'light'),p(310,170,150,14,'light'),p(270,120,70,65,'dark',true),p(285,133,40,39,'light',true),p(360,60,40,20,'metal'),p(360,220,40,20,'metal'),p(470,80,65,20,'light'),p(470,195,65,20,'light')]},
  {title:'赤焰翼刃',light:'#ffe99b',parts:[p(65,125,100,65,'dark'),p(160,105,170,95),p(205,190,45,55,'metal'),p(270,100,215,100),p(300,120,160,60,'dark'),p(335,128,65,44,'light',true),p(270,75,90,25,'metal'),p(300,50,95,25),p(345,30,80,22,'light'),p(270,200,90,25,'metal'),p(300,225,95,25),p(345,250,80,22,'light'),p(470,85,40,130,'metal'),p(500,105,45,30),p(500,165,45,30),p(510,140,50,20,'light')]},
];
export function weaponAppearance(level: number): WeaponAppearance {
  const design = designs[level - 1];
  if (!Number.isInteger(level) || !design) throw new Error('武器外观等级无效');
  return design;
}
export function weaponMaterial(part: WeaponPart, color: string, light: string): string {
  return part.material === 'armor' ? color : part.material === 'light' ? light : part.material === 'metal' ? '#718a98' : '#283e50';
}
