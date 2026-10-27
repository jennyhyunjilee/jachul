const sharp = require('/Users/leejenny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const path = require('path');
const dir = __dirname;
const version = process.argv[2] || 'v10';
const delay = Number(process.argv[3] || 120);
const transparent = process.argv.includes('--transparent');
if (!/^v\d+$/.test(version)) throw new Error('Invalid version');
if (!Number.isFinite(delay) || delay < 20) throw new Error('Invalid delay');
(async () => {
  const sprite = await sharp(path.join(dir, `subway-train-mascot-${version}.png`)).resize(768, 512, {kernel:'nearest'}).png().toBuffer();
  const positions = [0,-3,-6,-9,-6,-3,0,3,6,3];
  const frames = [];
  for (const y of positions) {
    const frame = sharp({create:{width:768,height:544,channels:4,background:transparent ? {r:0,g:0,b:0,alpha:0} : '#ffffff'}}).composite([{input:sprite,left:0,top:16+y}]);
    frames.push(await (transparent ? frame : frame.removeAlpha()).raw().toBuffer());
  }
  const animation = sharp(Buffer.concat(frames), {raw:{width:768,height:544*frames.length,channels:transparent ? 4 : 3,pageHeight:544}});
  await animation.clone().gif({loop:0,delay:positions.map(()=>delay),colours:128,dither:0,effort:7}).toFile(path.join(dir,`subway-train-float-${version}.gif`));
  if (transparent) await animation.clone().webp({loop:0,delay:positions.map(()=>delay),lossless:true}).toFile(path.join(dir,`subway-train-float-${version}.webp`));
  const m = await sharp(path.join(dir,`subway-train-float-${version}.gif`), {animated:true}).metadata();
  if(m.pages !== positions.length || m.loop !== 0 || m.pageHeight !== 544) throw new Error('Invalid animation');
  console.log(JSON.stringify({width:m.width,frameHeight:m.pageHeight,frames:m.pages,delays:m.delay,loop:m.loop}));
})();
