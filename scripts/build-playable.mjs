// Desktop offline distribution of the same 3D client entry used by Android.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const destination = process.argv[2];
if (!destination) throw Error("Supply the destination HTML file");
const root = process.cwd();
const entry = fs.readFileSync("out/index.html", "utf8");
const links = [...entry.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)].map(m=>m[1]);
if (!links.length) throw Error("Build the Android static web assets first");
const types = {".glb":"model/gltf-binary",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2",".woff":"font/woff",".json":"application/json"};
const runtime = `
import {Fragment,jsx as one,jsxs as many} from "react/jsx-runtime";
export {Fragment};
function wrap(render){return(type,props,key)=>{
 if(typeof type==="string" && props){
  if(typeof props.src==="string") props={...props,src:window.portURL(props.src)};
  if(props.style?.backgroundImage) props={...props,style:{...props.style,backgroundImage:window.portCSS(props.style.backgroundImage)}};
 }
 return render(type,props,key);
};}
export const jsx=wrap(one),jsxs=wrap(many);`;
const stubs={
 "next/image":`import React from "react";export default function Image({src,fill,priority,unoptimized,quality,placeholder,blurDataURL,loader,style,...p}){return React.createElement("img",{...p,src:window.portURL(typeof src==="string"?src:src.src),style:fill?{position:"absolute",inset:0,width:"100%",height:"100%",...style}:style});}`,
 "next/dynamic":`import React from "react";export default function dynamic(load){const C=React.lazy(load);return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,props));}`,
 "local-game/jsx-runtime":runtime,
};
const built=await build({
 stdin:{contents:`import React from "react";import{createRoot}from"react-dom/client";import{DefaultLoadingManager}from"three";import Game from "./src/components/Game";DefaultLoadingManager.setURLModifier(window.portURL);createRoot(document.getElementById("root")).render(React.createElement(Game));`,resolveDir:root,loader:"tsx"},
 jsx:"automatic",jsxImportSource:"local-game",bundle:true,minify:true,format:"iife",write:false,outdir:"offline",target:"chrome111",
 define:{"process.env.NODE_ENV":'"production"',"process.env.NEXT_PUBLIC_STATIC_GAME":'"1"'},
 plugins:[{name:"offline-3d-client",setup(b){
  b.onResolve({filter:/^(next\/(image|dynamic)|local-game\/jsx-runtime)$/},args=>({path:args.path,namespace:"offline"}));
  b.onLoad({filter:/.*/,namespace:"offline"},a=>({contents:stubs[a.path],resolveDir:root}));
  b.onResolve({filter:/^\//},args=>args.kind==="url-token" ? {path:args.path,external:true}:undefined);
 }}],
});
const css=links.map(url=>{
 const dir=path.posix.dirname(url);
 return fs.readFileSync("out"+url,"utf8").replace(/url\((["']?)(\.\.\/[^)'" ]+)\1\)/g,(_m,_q,target)=>"url("+path.posix.resolve(dir,target)+")");
}).join("\n")+(built.outputFiles.find(f=>f.path.endsWith(".css"))?.text || "");
const prepare=`
const cache=new Map();
window.portURL=function(url){
 if(!url || typeof url!=="string" || !url.startsWith("/"))return url;
 if(cache.has(url))return cache.get(url);
 const item=document.getElementById("asset:"+url);
 if(!item)return url;
 const binary=atob(item.textContent.trim());
 const bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
 const blob=URL.createObjectURL(new Blob([bytes],{type:item.dataset.mime}));
 cache.set(url,blob);item.remove();return blob;
};
window.portCSS=s=>s.replace(/url\\((["']?)(\\/[^)'"]+)\\1\\)/g,(m,q,url)=>"url("+window.portURL(url)+")");
const style=document.createElement("style");style.textContent=window.portCSS(${JSON.stringify(css)});document.head.append(style);`;
const escapeScript=s=>s.replace(/<\/script/gi,"<\\/script");
fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});
const file=fs.openSync(destination,"w");
function write(s){fs.writeFileSync(file,s);}
let count=0;
function embed(dir){
 for (const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isDirectory()){embed(full);continue;}
  const mime=types[path.extname(full)];if(!mime)continue;
  const url="/"+path.relative("out",full).split(path.sep).join("/");
  write('<script type="application/octet-stream" id="asset:'+url+'" data-mime="'+mime+'">');
  write(fs.readFileSync(full).toString("base64"));write("</script>");count++;
 }
}
try{
 write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,"><title>تنگه هرمز · بندر سه‌بعدی</title></head><body><div id="root"></div>');
 for(const name of ["assets","images","models","_next/static/media"])embed(path.join("out",name));
 write("<script>"+escapeScript(prepare)+"</script><script>"+escapeScript(built.outputFiles.find(f=>f.path.endsWith(".js")).text)+"</script>");
 write('<script id="notices" type="text/plain">'+escapeScript(fs.readFileSync("android/app/src/main/assets/licenses/third-party.txt","utf8"))+"</script></body></html>");
}finally{fs.closeSync(file);}
console.log("Offline 3D game:",count,"embedded assets,",fs.statSync(destination).size,"bytes");
