// Extract original isometric tower artwork into independently addressable, transparent models.
const sharp = require('sharp');
const fs = require('node:fs');
const packs = [
  { file:'public/images/towers-basic.png', columns:4, rows:3, names:['cannon-1','cannon-2','heavy-1','heavy-2','missile-1','missile-2','air-1','air-2','ew-1','ew-2','boat-1','boat-2'] },
  { file:'public/images/towers-advanced.png', columns:4, rows:3, names:['cannon-3','cannon-a','heavy-3','heavy-a','missile-3','missile-a','air-3','air-a','ew-3','ew-a','boat-3','boat-a'] },
  { file:'public/images/towers-special.png', columns:3, rows:2, names:['cannon-b','heavy-b','missile-b','air-b','ew-b','boat-b'] },
];
(async()=>{
  fs.mkdirSync('public/assets/models/towers',{recursive:true});
  for(const pack of packs){
    const {data,info}=await sharp(pack.file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const w=Math.floor(info.width/pack.columns),h=Math.floor(info.height/pack.rows);
    const bg=[data[0],data[1],data[2]];
    for(let n=0;n<pack.names.length;n++){
      const cell=Buffer.alloc(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const src=((Math.floor(n/pack.columns)*h+y)*info.width+(n%pack.columns)*w+x)*4,dst=(y*w+x)*4;
        const r=data[src],g=data[src+1],b=data[src+2];
        let alpha=1-Math.max(0,Math.min(1,(r-g)/Math.max(1,bg[0]-bg[1]),(b-g)/Math.max(1,bg[2]-bg[1])));
        alpha=alpha<.14?0:alpha>.96?1:alpha;
        const unmix=(channel,back)=>Math.max(0,Math.min(255,(channel-(1-alpha)*back)/Math.max(.001,alpha)));
        cell[dst]=unmix(r,bg[0]);cell[dst+1]=unmix(g,bg[1]);cell[dst+2]=unmix(b,bg[2]);cell[dst+3]=Math.round(alpha*255);
      }
      // Strip tiny accidental pieces from adjacent cells without deleting the model itself.
      const seen=new Uint8Array(w*h),components=[];
      for(let i=0;i<w*h;i++){
        if(seen[i]||cell[i*4+3]<35)continue;
        const q=[i];let head=0,edge=false;seen[i]=1;
        while(head<q.length){const k=q[head++],x=k%w,y=Math.floor(k/w);if(x<2||y<2||x>w-3||y>h-3)edge=true;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx<0||yy<0||xx>=w||yy>=h||seen[j]||cell[j*4+3]<35)continue;seen[j]=1;q.push(j);}}
        components.push({q,edge});
      }
      const max=Math.max(...components.map(c=>c.q.length));
      for(const component of components)if(component.edge&&component.q.length<max*.09)for(const i of component.q)cell[i*4+3]=0;
      const buffer=await sharp(cell,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
      await sharp(buffer).trim({background:'#00000000',threshold:20}).resize(220,220,{fit:'contain',background:'#00000000'}).png({compressionLevel:9}).toFile(`public/assets/models/towers/${pack.names[n]}.png`);
    }
    console.log(`${pack.file}: extracted ${pack.names.length} models; key RGB ${bg.join(',')}`);
  }
})().catch(error=>{console.error(error);process.exit(1)});
