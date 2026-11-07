/*
 * Builds a factual Hormuz Strait map and water-navigation collision mask from
 * the bundled OSM/ODbL island and national geodata in src/data/hormuz-geography.json.
 * No fake/generated coastline. Run: node scripts/build-real-strait-map.cjs
 */
const fs=require('node:fs'),sharp=require('sharp');
const osm=require('../src/data/hormuz-geography.json');
const maps={
  landscape:{west:52.34,east:60.56,south:24.48,north:28.64,size:240},
  portrait:{west:54.55,east:57.22,south:24.48,north:28.64,size:240},
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function project(lon,lat,b){return{x:(lon-b.west)/(b.east-b.west)*1000,y:(b.north-lat)/(b.north-b.south)*1000};}
function clipEdge(points,inside,intersect){
  if(!points.length)return [];
  const out=[];let previous=points[points.length-1],prevIn=inside(previous);
  for(const current of points){const currentIn=inside(current);if(currentIn!==prevIn)out.push(intersect(previous,current));if(currentIn)out.push(current);previous=current;prevIn=currentIn;}
  return out;
}
function clipRing(ring,b){
  let p=ring.map(([x,y])=>({x,y}));
  p=clipEdge(p,v=>v.x>=b.west,(a,c)=>({x:b.west,y:a.y+(c.y-a.y)*(b.west-a.x)/(c.x-a.x)}));
  p=clipEdge(p,v=>v.x<=b.east,(a,c)=>({x:b.east,y:a.y+(c.y-a.y)*(b.east-a.y)/(c.x-a.x)}));
  p=clipEdge(p,v=>v.y>=b.south,(a,c)=>({y:b.south,x:a.x+(c.x-a.x)*(b.south-a.y)/(c.y-a.y)}));
  p=clipEdge(p,v=>v.y<=b.north,(a,c)=>({y:b.north,x:a.x+(c.x-a.x)*(b.north-a.y)/(c.y-a.y)}));
  if(p.length<4)return [];
  if(Math.hypot(p[0].x-p[p.length-1].x,p[0].y-p[p.length-1].y)>.00001)p.push({...p[0]});
  return p;
}
function distanceToLine(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)return Math.hypot(p.x-a.x,p.y-a.y);const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function simplify(points,epsilon=.00028){if(points.length<=4)return points;const first=points[0],last=points[points.length-1],keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[[0,points.length-1]];while(stack.length){const [a,b]=stack.pop();let far=epsilon,index=-1;for(let i=a+1;i<b;i++){const d=distanceToLine(points[i],points[a],points[b]);if(d>far){far=d;index=i;}}if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}}const result=points.filter((_,i)=>keep[i]);return result.length>=4?result:points;}
function polygonsOf(feature){const g=feature.geojson;if(!g)return[];if(g.type==='Polygon')return[g.coordinates];if(g.type==='MultiPolygon')return g.coordinates;if(g.type==='GeometryCollection')return g.geometries.flatMap(x=>x.type==='Polygon'?[x.coordinates]:x.type==='MultiPolygon'?x.coordinates:[]);return[];}
const colors={iran:['#b7a07a','#e5d0a4','#887553'],oman:['#947c62','#d1b793','#715d4b'],uae:['#a38c6e','#e0c99c','#807054'],saudi:['#b19b76','#e4cfaa','#847456'],qatar:['#a58d6d','#dec99b','#7c694f'],bahrain:['#d7ad69','#f0d797','#906e48'],qeshm:['#b27558','#e9c093','#8c5947'],larak:['#a57958','#e4bf88','#77533f'],hormuz:['#af6255','#e8ad82','#824a47'],'tomb-greater':['#a58061','#e0c08f','#755740'],'tomb-lesser':['#ae8a65','#e7cd9e','#80644c'],'abu-musa':['#a68262','#ddbd90','#74583f'],'bandar-abbas':['#789078','#d6c793','#607358']};
function getPreparedPolygons(b){const prepared=[];for(const feature of osm.data){for(const polygon of polygonsOf(feature)){const rings=[];let area=0;for(const original of polygon){const clipped=clipRing(original,b);if(clipped.length<4)continue;const projected=simplify(clipped.map(point=>project(point.x,point.y,b)));let ringArea=0;for(let i=0,j=projected.length-1;i<projected.length;j=i++)ringArea+=projected[j].x*projected[i].y-projected[i].x*projected[j].y;area+=Math.abs(ringArea)/2;rings.push(projected);}if(rings.length&&area>2)prepared.push({key:feature.key,rings,area});}}return prepared.sort((a,b)=>b.area-a.area);}
function ringPath(ring){return ring.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')+'Z';}
function countryPaths(polygons){return polygons.map(p=>p.rings.map(ringPath).join(' ')).join(' ');}
const labels=[
  ['بندرعباس',56.27,27.18,'city'],['اسکله شهید رجایی',56.08,27.00,'port'],['جزیره قشم',55.78,26.78,'island'],['جزیره هرمز',56.46,27.065,'island'],['لارک',56.36,26.85,'island'],['جزایر تنب',55.30,26.26,'island'],['بوموسی',55.035,25.88,'island'],['خصب',56.25,26.19,'coast'],['خلیج فارس',54.12,26.45,'sea'],['دریای عمان',58.15,25.12,'sea'],['کیش',53.98,26.55,'island'],['فجیره',56.34,25.13,'coast']
];
function makeMapSvg(layout,b,art,polygons,landLayers){
  const P=(lon,lat)=>project(lon,lat,b),labels=[
    ['بندرعباس',56.266,27.183,'city'],['بندر شهید رجایی',56.092,27.040,'port'],
    ['جزیرهٔ قشم',55.775,26.770,'island'],['هرمز',56.464,27.065,'island'],['لارک',56.360,26.855,'island'],
    ['بوموسی',55.035,25.880,'island'],['تنب بزرگ',55.310,26.265,'island'],['تنب کوچک',55.150,26.240,'island'],
    ['کیش',53.980,26.530,'island'],['خصب',56.247,26.187,'coast'],['جاسک',57.770,25.650,'coast'],['فجیره',56.347,25.133,'coast'],
    ['خلیج فارس',54.650,26.050,'sea'],['تنگهٔ هرمز',57.150,25.740,'channel'],['دریای عمان',58.400,25.150,'sea']
  ];
  const shown=labels.map(([name,lon,lat,type])=>{const pt=P(lon,lat);if(pt.x < -4||pt.x>104||pt.y< -4||pt.y>104)return'';const x=pt.x*10,y=pt.y*10;
    if(type==='sea')return `<g class="geo-label ocean-label" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><text text-anchor="middle" direction="rtl" y="4">${name}</text></g>`;
    if(type==='channel')return `<g class="geo-label channel-label" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-12)"><text text-anchor="middle" direction="rtl" y="4">${name}</text></g>`;
    if(type==='port')return `<g class="geo-port" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="22" fill="#e9be66" fill-opacity=".11"/><circle r="11" fill="#123532" stroke="#f0d78c" stroke-width="2"/><path d="M-6 2h12v5H-6zM-3-8h6V2h-6zM-9 9H9" fill="#f1d492" stroke="#f1d492" stroke-width="1.3"/><circle r="17" fill="none" stroke="#f0cc7d" stroke-opacity=".6" stroke-dasharray="2 4"/><text x="17" y="-12" direction="rtl">${name}</text><text class="port-secondary" x="17" y="2" direction="rtl">اسکلهٔ بارگیری</text></g>`;
    return `<g class="geo-label ${type==='island'?'island-label':'shore-label'}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${type==='city'?4.4:2.7}"/><text x="${type==='city'?10:8}" y="4" direction="rtl">${name}</text></g>`;
  }).join('');
  const roads=[
    [[56.12,27.04],[56.16,27.09],[56.21,27.14],[56.27,27.183]],
    [[56.02,27.00],[56.06,27.04],[56.10,27.08],[56.17,27.14]],
    [[55.40,26.60],[55.49,26.67],[55.60,26.70],[55.77,26.77],[55.91,26.81],[56.06,26.85],[56.23,26.86],[56.34,26.86]],
    [[55.32,26.43],[55.41,26.54],[55.47,26.65]],
    [[56.435,27.048],[56.464,27.065],[56.482,27.085]],
    [[56.344,26.829],[56.360,26.855],[56.383,26.873]]
  ];
  const roadsSvg=roads.map((road,i)=>{const pts=road.map(([lon,lat])=>P(lon,lat)).map(pt=>`${(pt.x*10).toFixed(1)},${(pt.y*10).toFixed(1)}`).join(' ');return `<polyline class="island-road road-${i}" points="${pts}"/>`;}).join('');
  const shallow=[
    [[57.20,25.50],[56.85,25.76],[56.70,26.12],[56.52,26.52],[56.32,26.82]],
    [[56.06,27.0],[55.93,26.96],[55.78,26.94],[55.58,26.95]],
    [[57.28,25.52],[57.06,25.74],[56.95,26.06]]
  ].map(line=>{const pts=line.map(([lon,lat])=>P(lon,lat)).map(pt=>`${(pt.x*10).toFixed(1)},${(pt.y*10).toFixed(1)}`).join(' ');return `<polyline points="${pts}"/>`;}).join('');
  const textureLines=[];for(let i=0;i<26;i++){const x=(i*173+43)%1000,y=(i*317+91)%1000,rx=15+(i*41)%72,ry=8+(i*23)%32;textureLines.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`);}
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1600" viewBox="0 0 1000 1000">
<defs>
 <linearGradient id="ocean" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#0b3441"/><stop offset=".42" stop-color="#145260"/><stop offset=".72" stop-color="#123f52"/><stop offset="1" stop-color="#0a2f41"/></linearGradient>
 <radialGradient id="shallow"><stop stop-color="#58c3ac" stop-opacity=".55"/><stop offset=".46" stop-color="#41a89b" stop-opacity=".34"/><stop offset="1" stop-color="#399896" stop-opacity="0"/></radialGradient>
 <radialGradient id="land-sand"><stop stop-color="#f0dfad" stop-opacity=".37"/><stop offset=".45" stop-color="#e2c99a" stop-opacity=".11"/><stop offset="1" stop-color="#8e7757" stop-opacity=".31"/></radialGradient>
 <radialGradient id="island-sand"><stop stop-color="#dfc391" stop-opacity=".19"/><stop offset=".75" stop-color="#74644d" stop-opacity=".31"/><stop offset="1" stop-color="#332f28" stop-opacity=".38"/></radialGradient>
 <radialGradient id="terrain"><stop stop-color="#ead5ab" stop-opacity=".21"/><stop offset=".5" stop-color="#896f50" stop-opacity=".08"/><stop offset="1" stop-color="#493d31" stop-opacity=".2"/></radialGradient>
 <radialGradient id="depth"><stop stop-color="#145d69" stop-opacity="0"/><stop offset=".83" stop-color="#071d34" stop-opacity=".39"/><stop offset="1" stop-color="#071c30" stop-opacity=".1"/></radialGradient>
 <pattern id="water-grain" width="38" height="36" patternUnits="userSpaceOnUse"><circle cx="7" cy="11" r=".8" fill="#b6e9dc" opacity=".16"/><circle cx="28" cy="25" r=".7" fill="#8ed6d3" opacity=".16"/><path d="M16 8q5-2 9 0M2 30h6" fill="none" stroke="#d9f1dc" stroke-opacity=".08"/></pattern>
 <pattern id="earth-grain" width="29" height="28" patternUnits="userSpaceOnUse"><circle cx="5" cy="7" r="1.2" fill="#534938" opacity=".22"/><circle cx="20" cy="18" r="1.6" fill="#f0ddae" opacity=".24"/><path d="m12 23 5-2M23 4l3 2" fill="none" stroke="#594936" stroke-opacity=".15" stroke-width="1.1"/></pattern>
 <filter id="coast-shadow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>
 <clipPath id="map-frame"><rect width="1000" height="1000"/></clipPath>
</defs>
<rect width="1000" height="1000" fill="url(#ocean)"/><rect width="1000" height="1000" fill="url(#water-grain)"/><rect width="1000" height="1000" fill="url(#depth)"/>
<g fill="none" stroke="url(#shallow)" stroke-linecap="round" opacity=".5">${shallow}</g>
<g clip-path="url(#map-frame)">${art.svgPath.join('')}</g>
<g fill="none" stroke="#dfc699" stroke-opacity=".12" stroke-width="1">${textureLines.join('')}</g>
<g fill="none">${roadsSvg}</g><g class="map-places">${shown}</g>
<g class="lighthouse"><circle cx="${(P(56.10,27.04).x*10).toFixed(1)}" cy="${(P(56.10,27.04).y*10).toFixed(1)}" r="13" fill="#ffd878" opacity=".09"/><circle cx="${(P(56.10,27.04).x*10).toFixed(1)}" cy="${(P(56.10,27.04).y*10).toFixed(1)}" r="3" fill="#ffe7a3"/></g>
<rect x="8" y="951" width="31" height="2" fill="#d5ece0" opacity=".68"/><text x="8" y="968" fill="#c5ddd4" font-family="sans-serif" font-size="9" opacity=".8">50 km</text>
<text x="990" y="986" text-anchor="end" fill="#c3d9d2" font-family="sans-serif" font-size="8" stroke="#10333b" stroke-width="3" paint-order="stroke">© OpenStreetMap contributors · ODbL</text>
</svg>`;
}

function pointInRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi||1e-20)+xi)inside=!inside;}return inside;}
function isLand(lon,lat,b,polygons){for(const polygon of polygons){if(!pointInRing(lon,lat,polygon.rings[0]))continue;let hole=false;for(let i=1;i<polygon.rings.length;i++)if(pointInRing(lon,lat,polygon.rings[i])){hole=true;break;}if(!hole)return true;}return false;}
class Heap{constructor(){this.a=[];}push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){let p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.a,r=a[0],e=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let c=2*i+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=e.f)break;a[i]=a[c];i=c;}a[i]=e;}return r;}get length(){return this.a.length;}}
function route(mask,from,to,size){const map=p=>({x:clamp(Math.round(p.x/100*(size-1)),0,size-1),y:clamp(Math.round(p.y/100*(size-1)),0,size-1)}),near=point=>{const p=map(point);if(!mask[p.y*size+p.x])return p;for(let r=1;r<size;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=p.x+dx,y=p.y+dy;if(x>=0&&y>=0&&x<size&&y<size&&!mask[y*size+x])return{x,y};}throw Error('Water route missing near '+JSON.stringify(point));};const a=near(from),b=near(to),start=a.y*size+a.x,goal=b.y*size+b.x,cost=new Float32Array(size*size);cost.fill(Infinity);cost[start]=0;const parent=new Int32Array(size*size);parent.fill(-1);const heap=new Heap();heap.push({id:start,f:0});const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];while(heap.length){const cur=heap.pop().id;if(cur===goal)break;const x=cur%size,y=Math.floor(cur/size);for(const[dx,dy]of dirs){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;const id=yy*size+xx;if(mask[id]||(dx&&dy&&(mask[y*size+xx]||mask[yy*size+x])))continue;const nc=cost[cur]+(dx&&dy?1.414:1);if(nc>=cost[id])continue;cost[id]=nc;parent[id]=cur;heap.push({id,f:nc+Math.hypot(b.x-xx,b.y-yy)});}}if(goal!==start&&parent[goal]<0)throw Error('Sea channel disconnected');const path=[];for(let id=goal;id>=0;id=parent[id])path.push({x:id%size/(size-1)*100,y:Math.floor(id/size)/(size-1)*100});return path.reverse();}
function simplifyPath(path,mask,size){const water=(a,b)=>{const n=Math.ceil(Math.hypot((b.x-a.x)*(size-1)/100,(b.y-a.y)*(size-1)/100)*2);for(let i=0;i<=n;i++){const t=i/n,x=Math.round((a.x+(b.x-a.x)*t)/100*(size-1)),y=Math.round((a.y+(b.y-a.y)*t)/100*(size-1));if(mask[y*size+x])return false;}return true;};const out=[path[0]];let i=0;while(i<path.length-1){let j=path.length-1;while(j>i+1&&!water(path[i],path[j]))j--;out.push(path[j]);i=j;}return out;}
function pad(label,lon,lat,b,mask,size,id,island){let pt=project(lon,lat,b);const idx=(q)=>Math.max(0,Math.min(size-1,Math.round(q/100*(size-1))));if(mask[idx(pt.y)*size+idx(pt.x)]){let best=null;for(let r=1;r<size&&!best;r++)for(let y=-r;y<=r&&!best;y++)for(let x=-r;x<=r;x++){if(Math.max(Math.abs(x),Math.abs(y))!==r)continue;const xx=idx(pt.x)+x,yy=idx(pt.y)+y;if(xx>=0&&yy>=0&&xx<size&&yy<size&&!mask[yy*size+xx]){best={x:xx/(size-1)*100,y:yy/(size-1)*100};break;}}if(best)pt=best;}return{id,x:+pt.x.toFixed(2),y:+pt.y.toFixed(2),island,label};}
function roughPath(points){return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');}
function build(layout,b,polygons){const size=240,svgPath=[],landOnly=[];const colors={iran:['#ae9a78','#e2cda5','#766550'],oman:['#89765f','#c8a981','#645643'],uae:['#9e896d','#d7c39a','#705f4d'],saudi:['#b29b76','#ddc69a','#78694f'],qatar:['#9a8669','#d2bd92','#70614c'],bahrain:['#c3a06b','#ead098','#826747']};for(const key of ['saudi','bahrain','qatar','uae','oman','iran']){const items=polygons.filter(p=>p.key===key);if(!items.length)continue;const d=items.map(p=>p.rings.map(r=>roughPath(r)).join(' ')).join(' ');svgPath.push(`<path d="${d}" fill="${colors[key][0]}" fill-rule="evenodd" stroke="#282d2a" stroke-width="8" stroke-linejoin="round"/><path d="${d}" fill="url(#land-sand)" fill-rule="evenodd" stroke="${colors[key][2]}" stroke-width="3.2" stroke-linejoin="round"/><path d="${d}" fill="url(#terrain)" fill-rule="evenodd" opacity=".42"/>`);landOnly.push(`<path d="${d}" fill="#111" fill-rule="evenodd"/>`);}for(const key of ['qeshm','larak','hormuz','abu-musa','tomb-greater','tomb-lesser']){const items=polygons.filter(p=>p.key===key);for(const poly of items){const d=poly.rings.map(r=>roughPath(r)).join(' ');svgPath.push(`<path d="${d}" fill="#554841" fill-rule="evenodd" stroke="#1b2928" stroke-width="13" stroke-linejoin="round"/><path d="${d}" fill="url(#island-sand)" fill-rule="evenodd" stroke="#7f684d" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="url(#terrain)" fill-rule="evenodd" opacity=".5"/>`);landOnly.push(`<path d="${d}" fill="#111" fill-rule="evenodd"/>`);}}const maskSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="white"/><g fill-rule="evenodd">${landOnly.join('')}</g></svg>`;return{size,maskSvg,svgPath};}
(async()=>{const data=[];for(const layout of ['landscape','portrait']){const b=maps[layout],polygons=getPreparedPolygons(b),art=build(layout,b,polygons),size=art.size;const maskRGBA=await sharp(Buffer.from(art.maskSvg)).resize(size,size,{fit:'fill'}).ensureAlpha().raw().toBuffer();const raw=new Uint8Array(size*size);for(let i=0;i<raw.length;i++){raw[i]=maskRGBA[i*4]<128?1:0;}const clearance=layout==='portrait'?2:2,blocked=new Uint8Array(raw.length);for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(raw[y*size+x])for(let dy=-clearance;dy<=clearance;dy++)for(let dx=-clearance;dx<=clearance;dx++){if(dx*dx+dy*dy>clearance*clearance+1)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<size&&yy<size)blocked[yy*size+xx]=1;}const enemyGeo=layout==='landscape'?[[58.18,25.38],[57.30,25.73],[56.83,26.06],[56.61,26.65],[56.28,26.91],[56.08,27.04]]:[[56.92,25.35],[56.67,25.78],[56.39,26.32],[56.48,26.72],[56.08,27.04]];const tradeGeo=layout==='landscape'?[[58.15,25.80],[57.63,25.95],[57.13,26.08],[56.62,26.43],[56.21,26.82],[56.08,27.04]]:[[56.92,25.40],[56.62,25.84],[56.40,26.35],[56.48,26.72],[56.08,27.04]];const pirateGeo=layout==='landscape'?[[57.48,25.80],[57.21,26.00],[56.88,26.24],[56.60,26.43]]:[[56.85,25.74],[56.61,26.11],[56.43,26.40]];const toWorld=arr=>arr.map(([lon,lat])=>project(lon,lat,b));const stitch=(arr)=>{let all=[];for(let i=1;i<arr.length;i++){let seg=route(blocked,arr[i-1],arr[i],size);all.push(...(i>1?seg.slice(1):seg));}return simplifyPath(all,blocked,size).map(pt=>({x:+pt.x.toFixed(2),y:+pt.y.toFixed(2)}));};const enemy=stitch(toWorld(enemyGeo)),trade=stitch(toWorld(tradeGeo)),pirate=stitch(toWorld(pirateGeo));const landBits=Buffer.from(art.maskSvg);const geoData={size,land:Array.from(raw).join(''),blocked:Array.from(blocked).join(''),enemy,trade,pirate};data.push(geoData);await sharp(Buffer.from(makeMapSvg(layout,b,art,polygons,art.svgPath))).png().toFile(`public/images/hormuz-real-${layout}.png`);console.log(layout,'land rings',polygons.length,'enemy waypoints',enemy.length,'trade',trade.length,'water endpoints',enemy[0],enemy.at(-1));}fs.writeFileSync('src/data/navigation.json',JSON.stringify({landscape:data[0],portrait:data[1]}));})().catch(error=>{console.error(error);process.exit(1);});
