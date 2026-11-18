const fs=require('node:fs');const {load}=require('./load-game.cjs');
const {readInstallation,retentionCohorts}=load('src/lib/analytics.ts');
const files=process.argv.slice(2);
if(!files.length){console.error('Usage: npm run retention:report -- installation-export.json [...]');process.exit(2);}
const logs=files.map(file=>{const log=readInstallation(fs.readFileSync(file,'utf8'));if(!log)throw Error('Invalid installation export: '+file);return log;});
console.log(JSON.stringify({sample:'Exported installations only; not an unbiased population estimate',...retentionCohorts(logs,Date.now())},null,2));
