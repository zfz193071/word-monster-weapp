// Recolor only the clothing in our original SVG, preserving face, hands and outlines.
const fs = require('node:fs');
const { Resvg } = require(process.env.RESVG_MODULE || '@resvg/resvg-js');
const colors = { apple: ['#c44c4d','#ee8b76'], banana: ['#d5b43b','#f5dc76'], orange: ['#da8136','#f4b56b'], grape: ['#8260a5','#b293cc'], watermelon: ['#48865b','#82b475'], pear: ['#a4ae42','#d1ce79'], strawberry: ['#ce4c62','#ef91a0'], cherry: ['#9e3c50','#cd7180'], pineapple: ['#bb9439','#e2c76a'], kiwi: ['#789747','#b1c779'], peach: ['#db8f81','#f4c0aa'] };
const source = fs.readFileSync('docs/assets/original/zombie-body.svg','utf8');
for (const [word, [base, light]] of Object.entries(colors)) {
 const svg = source.replaceAll('#a28a6e',base).replaceAll('#c2b08b',light).replaceAll('#d4c4a3',light);
 fs.writeFileSync(`docs/assets/original/zombie-body-${word}.svg`,svg);
 fs.writeFileSync(`miniprogram/assets/images/fortress/zombie-body-${word}.png`,new Resvg(svg).render().asPng());
}
