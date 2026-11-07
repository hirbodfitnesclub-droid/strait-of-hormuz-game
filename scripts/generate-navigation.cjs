// Generates terrain collision masks and routes from the actual map images.
// Run with: node scripts/generate-navigation.cjs
const sharp = require('sharp');
const fs = require('node:fs');
const SIZE = 180;

class Heap {
  constructor() { this.a = []; }
  push(v) { const a=this.a; a.push(v); let i=a.length-1; while(i){let p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v; }
  pop() { const a=this.a, root=a[0], end=a.pop(); if(a.length){let i=0;while(2*i+1<a.length){let c=2*i+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=end.f)break;a[i]=a[c];i=c;}a[i]=end;} return root; }
  get length(){return this.a.length;}
}
function xy(point) { return { x:Math.max(0,Math.min(SIZE-1,Math.round(point.x/100*(SIZE-1)))),y:Math.max(0,Math.min(SIZE-1,Math.round(point.y/100*(SIZE-1)))) }; }
function world(x,y) { return {x:+(x/(SIZE-1)*100).toFixed(2),y:+(y/(SIZE-1)*100).toFixed(2)}; }
function closest(mask, point) {
  const p=xy(point); let best=null, dist=Infinity;
  for(let r=0;r<SIZE;r++) {
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      const x=p.x+dx,y=p.y+dy;if(x<0||x>=SIZE||y<0||y>=SIZE||mask[y*SIZE+x])continue;
      const d=dx*dx+dy*dy;if(d<dist){best={x,y};dist=d;}
    }
    if(best)return best;
  }
  throw Error('No navigable water near '+JSON.stringify(point));
}
function find(mask, from, to) {
  const a=closest(mask,from),b=closest(mask,to), start=a.y*SIZE+a.x,goal=b.y*SIZE+b.x;
  const score=new Float64Array(SIZE*SIZE);score.fill(Infinity);score[start]=0;
  const parent=new Int32Array(SIZE*SIZE);parent.fill(-1);
  const open=new Heap();open.push({id:start,f:0});
  const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  while(open.length){const curr=open.pop().id;if(curr===goal)break;const x=curr%SIZE,y=Math.floor(curr/SIZE);
    for(const [dx,dy] of offsets){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=SIZE||ny>=SIZE)continue;const id=ny*SIZE+nx;if(mask[id]||(dx&&dy&&(mask[y*SIZE+nx]||mask[ny*SIZE+x])))continue;
      let near=0;for(const [ox,oy] of [[3,0],[-3,0],[0,3],[0,-3]]){const xx=nx+ox,yy=ny+oy;if(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE&&mask[yy*SIZE+xx])near++;}
      const d=score[curr]+(dx&&dy?1.414:1)+near*.18;if(d>=score[id])continue;score[id]=d;parent[id]=curr;open.push({id,f:d+Math.hypot(b.x-nx,b.y-ny)});
    }
  }
  if(goal!==start&&parent[goal]<0) throw Error('Disconnected water: '+JSON.stringify({from,to,a,b}));
  const result=[];for(let id=goal;id!==-1;id=parent[id])result.push({x:id%SIZE,y:Math.floor(id/SIZE)});return result.reverse();
}
function clear(mask,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,n=Math.ceil(Math.hypot(dx,dy)*24);
  for(let i=0;i<=n;i++){const x=Math.round(a.x+dx*i/Math.max(1,n)),y=Math.round(a.y+dy*i/Math.max(1,n));if(mask[y*SIZE+x])return false;}return true;
}
function simplify(mask,path) { const out=[path[0]];let i=0;while(i<path.length-1){let j=path.length-1;while(j>i+1&&!clear(mask,path[i],path[j]))j--;out.push(path[j]);i=j;}return out; }
function route(mask, checkpoints) {
  let result=[];for(let i=0;i<checkpoints.length-1;i++){let section=simplify(mask,find(mask,checkpoints[i],checkpoints[i+1]));result.push(...(i?section.slice(1):section));}
  return result.map(p=>world(p.x,p.y));
}
async function makeMap(name,file,checkpoints,tradeCheckpoints,pirateCheckpoints) {
  const {data,info}=await sharp(file).resize(SIZE,SIZE,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const raw=new Uint8Array(SIZE*SIZE);
  for(let i=0;i<SIZE*SIZE;i++) {const [r,g,b]=data.subarray(i*info.channels,i*info.channels+3);raw[i]=(r>g+6&&r>b+11&&r>44&&r>g*1.045&&r>b*1.07)?1:0;}
  // Close small gaps, then expand the shoreline for the width of the ship hull.
  const closed=new Uint8Array(raw.length);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE)sum+=raw[yy*SIZE+xx];}closed[y*SIZE+x]=sum>=3?1:0;}
  const blocked=new Uint8Array(raw.length), clearance=name==='portrait'?3:2;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(closed[y*SIZE+x])for(let dy=-clearance;dy<=clearance;dy++)for(let dx=-clearance;dx<=clearance;dx++){if(dx*dx+dy*dy>clearance*clearance+1)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE)blocked[yy*SIZE+xx]=1;}
  const enemy=route(blocked,checkpoints),trade=route(blocked,tradeCheckpoints),pirate=route(blocked,pirateCheckpoints);
  console.log(name,'land',blocked.reduce((a,b)=>a+b,0),'enemy',JSON.stringify(enemy),'trade',JSON.stringify(trade),'pirate',JSON.stringify(pirate));
  const maskRGBA=Buffer.alloc(SIZE*SIZE*4);for(let i=0;i<blocked.length;i++){maskRGBA[i*4]=255;maskRGBA[i*4+1]=35;maskRGBA[i*4+2]=12;maskRGBA[i*4+3]=blocked[i]?100:0;}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${[[enemy,'#ff392e'],[trade,'#68ffff'],[pirate,'#ffdd37']].map(([line,color])=>`<polyline points="${line.map(p=>`${p.x/100*SIZE},${p.y/100*SIZE}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.1"/>`).join('')}</svg>`;
  const base=await sharp(file).resize(SIZE,SIZE,{fit:'fill'}).png().toBuffer();
  const overlay=await sharp(maskRGBA,{raw:{width:SIZE,height:SIZE,channels:4}}).png().toBuffer();
  const combined=await sharp(base).composite([{input:overlay},{input:Buffer.from(svg)}]).png().toBuffer();
  await sharp(combined).resize(720,720,{kernel:'nearest'}).png().toFile(`.artifacts/navigation-${name}.png`);
  return {size:SIZE,land:Array.from(closed).join(''),blocked:Array.from(blocked).join(''),enemy,trade,pirate};
}
(async()=>{
  fs.mkdirSync('.artifacts',{recursive:true});fs.mkdirSync('src/data',{recursive:true});
  const landscape=await makeMap('landscape','public/images/hormuz-map-optimized.jpg',
    [{x:97,y:78},{x:82,y:73},{x:74,y:56},{x:70,y:45},{x:52,y:53},{x:37,y:65},{x:26,y:38}],
    [{x:96,y:30},{x:77,y:37},{x:52,y:51},{x:24,y:37}],
    [{x:92,y:25},{x:77,y:37},{x:60,y:46}]);
  const portrait=await makeMap('portrait','public/images/hormuz-map-portrait-optimized.jpg',
    [{x:85,y:95},{x:71,y:73},{x:30,y:73},{x:27,y:57},{x:38,y:33},{x:62,y:29}],
    [{x:89,y:91},{x:74,y:67},{x:73,y:45},{x:65,y:30}],
    [{x:84,y:78},{x:75,y:60},{x:72,y:44}]);
  fs.writeFileSync('src/data/navigation.json',JSON.stringify({landscape,portrait}));
})().catch(error=>{console.error(error);process.exit(1);});
