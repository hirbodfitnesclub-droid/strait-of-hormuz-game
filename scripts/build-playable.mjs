import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const destination = process.argv[2];
if (!destination) throw Error("Supply the destination HTML file");
const assets = {};
function add(url, file, type) {
  assets[url] = { type, base64: fs.readFileSync(file).toString("base64") };
}
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(name);
    else if (name.endsWith(".webp"))
      add(
        "/" + path.relative("public", name).split(path.sep).join("/"),
        name,
        "image/webp",
      );
  }
}
visit("public/harbor");
let css = fs.readFileSync("src/app/harbor.css", "utf8");
for (const weight of [400, 500, 600, 700, 800, 900]) {
  const name = "vazirmatn-arabic-" + weight + "-normal.woff2",
    url = "/embedded-fonts/" + name;
  add(url, "node_modules/@fontsource/vazirmatn/files/" + name, "font/woff2");
  css +=
    "\n@font-face{font-family:Vazirmatn;font-style:normal;font-weight:" +
    weight +
    ";src:url(" +
    url +
    ') format("woff2")}';
}
// Resolve the same JSX image and inline background paths against in-memory files.
const runtime = `
import {Fragment,jsx as one,jsxs as many} from "react/jsx-runtime";
export {Fragment};
function wrap(render){
  return (type,props,key)=>{
    if(typeof type==="string"&&props){
      const source=props.src,background=props.style?.backgroundImage;
      if(typeof source==="string"&&window.harborFiles[source])props={...props,src:window.harborFiles[source]};
      if(typeof background==="string")props={...props,style:{...props.style,backgroundImage:window.harborCSS(background)}};
    }
    return render(type,props,key);
  };
}
export const jsx=wrap(one),jsxs=wrap(many);
`;
const result = await build({
  stdin: {
    contents:
      'import React from "react"; import {createRoot} from "react-dom/client"; import Game from "./src/harbor/Game"; createRoot(document.getElementById("root")).render(React.createElement(Game));',
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  jsx: "automatic",
  jsxImportSource: "local-game",
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "chrome111",
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_STATIC_GAME": '"1"',
  },
  plugins: [
    {
      name: "local-game-images",
      setup(b) {
        b.onResolve({ filter: /^local-game\/jsx-runtime$/ }, () => ({
          path: "runtime",
          namespace: "local-game",
        }));
        b.onLoad({ filter: /.*/, namespace: "local-game" }, () => ({
          contents: runtime,
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const escapeScript = (s) => s.replace(/<\/script/gi, "<\\/script");
const prepare = `
window.harborFiles=Object.create(null);
for(const [name,file] of Object.entries(JSON.parse(document.getElementById("files").textContent))){
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
  window.harborFiles[name]=URL.createObjectURL(new Blob([bytes],{type:file.type}));
}
window.harborCSS=text=>text.replace(/url\\((["']?)(\\/(?:harbor|embedded-fonts)\\/[^)'"]+)\\1\\)/g,(full,q,name)=>window.harborFiles[name]?"url("+window.harborFiles[name]+")":full);
const sheet=document.createElement("style");
sheet.textContent=window.harborCSS(${JSON.stringify(css)});document.head.append(sheet);
`;
const notices = fs.readFileSync(
  "android/app/src/main/assets/licenses/third-party.txt",
  "utf8",
);
const html =
  '<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#082a32"><link rel="icon" href="data:,"><title>تنگه هرمز | بازگشایی تنگه</title><div id="root"></div><script type="application/json" id="files">' +
  JSON.stringify(assets) +
  "</script><script>" +
  escapeScript(prepare) +
  "</script><script>" +
  escapeScript(result.outputFiles[0].text) +
  '</script><script type="text/plain" id="notices">' +
  escapeScript(notices) +
  "</script></html>";
fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
fs.writeFileSync(destination, html);
console.log("Playable HTML built", Buffer.byteLength(html), "bytes");
