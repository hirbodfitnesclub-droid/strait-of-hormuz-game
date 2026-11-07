const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(source) {
  const file = path.resolve(source);
  if (file.endsWith('.json')) return require(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id.startsWith('./') || id.startsWith('../') || id.startsWith('@/')) {
      const resolved = id.startsWith('@/') ? path.resolve('src', id.slice(2)) : path.resolve(path.dirname(file), id);
      return load(path.extname(resolved) ? resolved : resolved + '.ts');
    }
    return require(id);
  };
  new Function('exports','module','require',code)(module.exports,module,localRequire);
  return module.exports;
}
module.exports = { load };
