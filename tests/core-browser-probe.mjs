// Actual-font geometry probe. Run: node tests/core-browser-probe.mjs
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const bundle=await build({entryPoints:[path.join(root,'packages/core/src/index.ts')],bundle:true,write:false,format:'iife',globalName:'LivingPosterCore',platform:'browser',target:'es2023'});
const fontIds=['space-regular','space-bold','fraunces-regular','fraunces-bold','mono-regular','mono-bold'];
const sources=Object.fromEntries(await Promise.all(fontIds.map(async id=>[id,`data:font/woff2;base64,${(await readFile(path.join(root,`apps/web/public/fonts/${id}.woff2`))).toString('base64')}`])));
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1140,height:1000},deviceScaleFactor:1});
  await page.setContent('<style>body{margin:0;padding:24px;background:#e5e2db;display:grid;grid-template-columns:repeat(3,350px);gap:20px;font:12px monospace}canvas{display:block;width:350px;height:437.5px}p{margin:8px 0 0}</style>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async sources=>{
    const core=globalThis.LivingPosterCore;await core.loadFonts(sources);const output=[];
    for(const example of core.EXAMPLES) {
      try {
        const compiled=core.compileScene(example.scene),frames=[0,1200,2400,3600,4800,6000].map(timeMs=>core.evaluateScene(compiled,{timeMs,pointer:core.samplePointer(example.scene,timeMs)}));
        const container=document.createElement('div'),canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;core.paintFrame(canvas.getContext('2d'),frames[0]);container.append(canvas);const label=document.createElement('p');label.textContent=example.title;container.append(label);document.body.append(container);
        output.push({id:example.id,ok:true,glyphs:compiled.glyphCount,units:frames[0].units.length,endpointEqual:JSON.stringify(frames[0])===JSON.stringify(frames.at(-1)),corrections:frames.map(f=>f.boundsCorrections)});
      } catch(error) {output.push({id:example.id,ok:false,error:String(error)});}
    }
    return output;
  },sources);
  await mkdir(path.join(root,'tests/core-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'tests/core-artifacts/gallery.png'),fullPage:true});
  console.log(JSON.stringify(result,null,2));
  if(result.some(r=>!r.ok||!r.endpointEqual))process.exitCode=1;
} finally {await browser.close();}
