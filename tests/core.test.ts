import {describe,it,expect,vi} from 'vitest';
import fc from 'fast-check';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sha256} from '../packages/core/src/hash';
import {EXAMPLES,validateScene,cloneScene,reviseScene,applyOperations,defaultBehavior,compileScene,evaluateScene,hitTest,samplePointer,closePointerLoop,type Scene,type Behavior,type Layer,type GlyphMeasurer} from '../packages/core/src';

const measure:GlyphMeasurer=(_id,size,text)=>({width:size*.55*text.length,left:0,right:text===' '?0:size*.52*text.length,ascent:size*.72,descent:size*.02});
function fixture():Scene {
  const s=cloneScene(EXAMPLES[0]!.scene);s.layers=[{id:'subject',name:'Subject',kind:'shape',shape:'rect',width:100,height:70,fill:'#20211F',visible:true,locked:false,opacity:1,layout:{x:540,y:600,rotationDeg:0},behaviors:[]},{id:'anchor',name:'Anchor',kind:'shape',shape:'ellipse',width:30,height:30,fill:'#AA3322',visible:true,locked:false,opacity:1,layout:{x:610,y:610,rotationDeg:0},behaviors:[]}];return s;
}
function withBehavior(type:Behavior['type']):Scene {const s=fixture();s.layers[0]!.behaviors=[defaultBehavior(type,6000,s.layers[0])];if(type==='wave'||type==='scatter'){s.layers[0]={...EXAMPLES[0]!.scene.layers.find(l=>l.id==='gravity-headline')!,id:'subject',layout:{x:540,y:650,rotationDeg:0},fontSize:96,behaviors:[defaultBehavior(type,6000)]} as Layer;}return s;}

describe('closed scene language',()=>{
  it('validates all six independent examples',()=>{expect(EXAMPLES).toHaveLength(6);for(const example of EXAMPLES)expect(validateScene(example.scene)).toEqual(example.scene);});
  it.each([
    ['unknown property',(s:Scene)=>Object.assign(s,{code:'alert(1)'})],
    ['renderer version',(s:Scene)=>Object.assign(s,{rendererVersion:'9'})],
    ['font hash',(s:Scene)=>Object.assign(s.fonts[0]!,{assetHash:'untrusted'})],
    ['duplicate layer',(s:Scene)=>s.layers.push(structuredClone(s.layers[0]!))],
    ['nonfinite layout',(s:Scene)=>s.layers[0]!.layout.x=Infinity],
    ['unknown anchor',(s:Scene)=>s.layers[0]!.behaviors.push({...defaultBehavior('attract',6000),params:{anchor:{type:'layer',layerId:'absent'},strength:1,maxDistance:90}} as Behavior)],
    ['self anchor',(s:Scene)=>s.layers[0]!.behaviors.push({...defaultBehavior('attract',6000),params:{anchor:{type:'layer',layerId:'subject'},strength:1,maxDistance:90}} as Behavior)],
    ['distant orbit',(s:Scene)=>s.layers[0]!.behaviors.push({...defaultBehavior('orbit',6000),params:{anchor:{type:'point',x:10,y:10},cycles:1,direction:1}} as Behavior)],
    ['short window',(s:Scene)=>s.layers[0]!.behaviors.push({...defaultBehavior('float',6000),startMs:5990})],
    ['oversized amplitude',(s:Scene)=>s.layers[0]!.behaviors.push({...defaultBehavior('float',6000),params:{amplitudeX:900,amplitudeY:10,cycles:1,phase:0,rotationAmplitudeDeg:0}} as Behavior)],
    ['glyph motion on shape',(s:Scene)=>s.layers[0]!.behaviors.push(defaultBehavior('wave',6000))],
    ['duplicate behavior type',(s:Scene)=>s.layers[0]!.behaviors.push(defaultBehavior('float',6000),defaultBehavior('float',6000))],
  ])('rejects %s',(_name,mutate)=>{const s=fixture();mutate(s);expect(()=>validateScene(s)).toThrow();});
  it('rejects unsupported characters and fonts absent from the manifest',()=>{const s=cloneScene(EXAMPLES[0]!.scene),l=s.layers.find(l=>l.kind==='text')!;if(l.kind!=='text')throw Error();l.text='你好';expect(()=>validateScene(s)).toThrow(/Unsupported character/);l.text='Café';s.fonts=s.fonts.filter(f=>f.id!==l.fontId);expect(()=>validateScene(s)).toThrow(/absent/);});
  it('enforces glyph budgets',()=>{const s=cloneScene(EXAMPLES[0]!.scene),l=s.layers.find(l=>l.kind==='text')!;if(l.kind==='text')l.text='A'.repeat(513);expect(()=>validateScene(s)).toThrow(/512/);});
  it('rejects impossible base geometry including rotated shapes',()=>{const s=fixture();s.layers[0]!.layout.x=16;expect(()=>compileScene(s)).toThrow(/margin/);s.layers[0]!.layout.x=70;s.layers[0]!.layout.rotationDeg=45;expect(()=>compileScene(s)).toThrow(/margin/);});
  it('fails visibly before text fonts are loaded',()=>{expect(()=>compileScene(EXAMPLES[0]!.scene)).toThrow(/not loaded/);});
});

describe('absolute motion evaluation',()=>{
  it.each(['float','orbit','wave','scatter','attract','repel'] as const)('%s has exact loop endpoints and independent seeking',type=>{
    const s=withBehavior(type),compiled=compileScene(s,measure),pointer={x:520,y:570,presence:1};const at=(timeMs:number)=>evaluateScene(compiled,{timeMs,pointer});
    expect(at(0)).toEqual(at(6000));expect(at(6000)).toEqual(at(600000));
    const expected=at(2574);for(const time of [5999,100,3500,-234,1e9])at(time);expect(at(2574)).toEqual(expected);expect(s).toEqual(compiled.scene);
    expect(at(2100).units).not.toEqual(at(0).units);
  });
  it('uses half-open windows and returns exactly to base outside the window',()=>{
    const s=withBehavior('float');s.layers[0]!.behaviors[0]!.startMs=1000;s.layers[0]!.behaviors[0]!.endMs=4000;const c=compileScene(s),at=(timeMs:number)=>evaluateScene(c,{timeMs,pointer:null});expect(at(0)).toEqual(at(1000));expect(at(0)).toEqual(at(4000));expect(at(2000)).not.toEqual(at(0));
  });
  it('uses the documented float equation',()=>{const s=withBehavior('float');s.layers[0]!.behaviors=[{...defaultBehavior('float',6000),params:{amplitudeX:40,amplitudeY:60,cycles:1,phase:0,rotationAmplitudeDeg:0}} as Behavior];const u=evaluateScene(compileScene(s),{timeMs:1500,pointer:null}).units[0]!;expect(u.x).toBeCloseTo(560,10);expect(u.y).toBeCloseTo(600,10);});
  it('orbits the immutable base pivot without chasing another animated layer',()=>{const s=fixture();s.layers[0]!.behaviors=[{...defaultBehavior('orbit',6000),params:{anchor:{type:'layer',layerId:'anchor'},cycles:1,direction:1}} as Behavior];const a=evaluateScene(compileScene(s),{timeMs:1800,pointer:null}).units[0];s.layers[1]!.behaviors=[defaultBehavior('float',6000)];expect(evaluateScene(compileScene(s),{timeMs:1800,pointer:null}).units[0]).toEqual(a);});
  it('remains continuous across the pointer center',()=>{
    const c=compileScene(withBehavior('repel'));const at=(delta:number)=>evaluateScene(c,{timeMs:3000,pointer:{x:540+delta,y:600,presence:1}}).units[0]!;
    expect(at(0).x).toBe(540);expect(Math.abs(at(.0001).x-at(-.0001).x)).toBeLessThan(.002);expect(at(10).x).toBeLessThan(540);
  });
  it('all compositions and permitted summed effects remain inside the inset',()=>{
    const scenes=EXAMPLES.map(e=>e.scene);const mixed=withBehavior('scatter');mixed.layers[0]!.behaviors.push(defaultBehavior('float',6000),defaultBehavior('wave',6000),defaultBehavior('attract',6000),defaultBehavior('repel',6000),defaultBehavior('orbit',6000,mixed.layers[0]));scenes.push(mixed);
    for(const s of scenes){const c=compileScene(s,measure);fc.assert(fc.property(fc.integer({min:-12000,max:12000}),timeMs=>{const frame=evaluateScene(c,{timeMs,pointer:{x:540,y:675,presence:1}});for(const u of frame.units){expect(u.bounds.x).toBeGreaterThanOrEqual(16-1e-6);expect(u.bounds.y).toBeGreaterThanOrEqual(16-1e-6);expect(u.bounds.x+u.bounds.width).toBeLessThanOrEqual(1064+1e-6);expect(u.bounds.y+u.bounds.height).toBeLessThanOrEqual(1334+1e-6);expect(Number.isFinite(u.rotationDeg)).toBe(true);}}),{numRuns:40});}
  });
  it('bounds correction translates a unit without mutating its base',()=>{const s=withBehavior('float');s.layers[0]!.layout={x:70,y:75,rotationDeg:0};s.layers[0]!.behaviors=[{...defaultBehavior('float',6000),params:{amplitudeX:80,amplitudeY:80,cycles:1,phase:Math.PI,rotationAmplitudeDeg:10}} as Behavior];const copy=cloneScene(s),frame=evaluateScene(compileScene(s),{timeMs:1500,pointer:null});expect(frame.boundsCorrections).toBeGreaterThan(0);expect(s).toEqual(copy);});
  it('hit tests visible ink in reverse paint order',()=>{const s=fixture();s.layers[1]!.layout={...s.layers[0]!.layout};const f=evaluateScene(compileScene(s),{timeMs:0,pointer:null});expect(hitTest(f,540,600)).toBe('anchor');expect(hitTest(f,0,0)).toBeNull();s.layers[1]!.visible=false;expect(hitTest(evaluateScene(compileScene(s),{timeMs:0,pointer:null}),540,600)).toBe('subject');});
  it('treats special JavaScript property names as inert layer IDs',()=>{const s=fixture();s.layers[0]!.id='__proto__';s.layers[1]!.id='constructor';const f=evaluateScene(compileScene(s),{timeMs:1000,pointer:null});expect(f.bounds['__proto__']!.width).toBe(100);expect(f.bounds['constructor']!.width).toBe(30);expect(f.units.every(u=>Number.isFinite(u.x))).toBe(true);});
  it('keeps all graphemes including static text on the same measured layout',()=>{const s=cloneScene(EXAMPLES[0]!.scene),l=s.layers.find(l=>l.kind==='text')!;if(l.kind!=='text')throw Error();l.text='AV café\nA B';l.fontSize=24;l.layout={x:200,y:200,rotationDeg:0};s.layers=[l];const c=compileScene(s,measure),frame=evaluateScene(c,{timeMs:0,pointer:null});expect(frame.units.map(u=>u.text).join('')).toBe('AVcaféAB');expect(frame.units.map(u=>u.index)).toEqual([0,1,3,4,5,6,8,10]);expect(frame.units[2]!.x-frame.units[1]!.x).toBeCloseTo(24*(.55+l.trackingEm)*2,10);});
});

describe('saved pointer input',()=>{
  it('persists a seam from the exact boundary and interpolates presence',()=>{const samples=[{timeMs:0,x:100,y:200,presence:0},{timeMs:5500,x:650,y:750,presence:1},{timeMs:6000,x:850,y:950,presence:1}];const closed=closePointerLoop(samples,6000);expect(closed[0]).toEqual(samples[0]);expect(closed.find(p=>p.timeMs===5750)).toEqual({timeMs:5750,x:750,y:850,presence:1});expect(closed.at(-1)).toEqual({...samples[0],timeMs:6000});const s=fixture();s.pointer={mode:'recorded',samples:closed,seamPolicy:'blend-250ms'};validateScene(s);expect(samplePointer(s,6000)).toEqual(samplePointer(s,0));expect(samplePointer(s,2750)).toEqual({x:375,y:475,presence:.5});});
  it('caps samples at 601 and does not mutate input',()=>{const input=Array.from({length:601},(_,i)=>({timeMs:i*10000/600,x:500,y:500,presence:1}));const original=structuredClone(input),result=closePointerLoop(input,10000);expect(result.length).toBeLessThanOrEqual(601);expect(input).toEqual(original);});
  it('rejects out of order samples and unmatched endpoints',()=>{const s=fixture();s.pointer={mode:'recorded',seamPolicy:'blend-250ms',samples:[{timeMs:0,x:10,y:10,presence:0},{timeMs:500,x:20,y:20,presence:1},{timeMs:499,x:10,y:10,presence:0},{timeMs:6000,x:10,y:10,presence:0}]};expect(()=>validateScene(s)).toThrow(/increase/);s.pointer.samples.splice(2,1);s.pointer.samples.at(-1)!.x=99;expect(()=>validateScene(s)).toThrow(/match/);});
});

describe('atomic narrow commands',()=>{
  it('changes only requested properties, preserves wording and creates a fresh revision',()=>{const s=cloneScene(EXAMPLES[0]!.scene),old=cloneScene(s),target=s.layers.find(l=>l.id==='gravity-headline')!;const result=applyOperations(s,[{type:'setFill',layerId:target.id,colour:'#123456'},{type:'upsertBehavior',layerId:target.id,behavior:defaultBehavior('float',6000)}]);expect(s).toEqual(old);expect(result.scene.revision.id).not.toBe(s.revision.id);expect(result.scene.revision.parentId).toBe(s.revision.id);expect(result.affectedLayerIds).toEqual([target.id]);expect(result.scene.layers.filter(l=>l.id!==target.id)).toEqual(s.layers.filter(l=>l.id!==target.id));const updated=result.scene.layers.find(l=>l.id===target.id)!;expect({...updated,fill:target.fill,behaviors:target.behaviors}).toEqual(target);});
  it('rejects an entire batch when any operation is invalid',()=>{const s=fixture(),old=cloneScene(s);expect(()=>applyOperations(s,[{type:'setFill',layerId:'subject',colour:'#123456'},{type:'removeBehavior',layerId:'anchor',behaviorId:'missing'}])).toThrow();expect(s).toEqual(old);expect(()=>applyOperations(s,[{type:'setLayout',layerId:'subject',changes:{x:12,script:'bad'} as never}])).toThrow();});
  it('requires explicit wording permission and an exact old-text precondition',()=>{const s=cloneScene(EXAMPLES[0]!.scene),op={type:'setText' as const,layerId:'gravity-headline',expectedOldText:'GRAVITY',newText:'CLOSER'};expect(()=>applyOperations(s,[op])).toThrow(/disabled/);expect(()=>applyOperations(s,[{...op,expectedOldText:'old'}],{allowTextChanges:true})).toThrow(/changed/);const next=applyOperations(s,[op],{allowTextChanges:true});expect((next.scene.layers.find(l=>l.id==='gravity-headline') as {text:string}).text).toBe('CLOSER');});
  it('retains behavior arrays when changing base layout and typography',()=>{const s=cloneScene(EXAMPLES[2]!.scene),l=s.layers.find(l=>l.id==='after-headline')!;const next=applyOperations(s,[{type:'setLayout',layerId:l.id,changes:{x:100}},{type:'setTypography',layerId:l.id,changes:{fontSize:190}}]);expect(next.scene.layers.find(n=>n.id===l.id)!.behaviors).toEqual(l.behaviors);});
  it('validates reorder references and puts null at the front of paint order',()=>{const s=fixture();expect(()=>applyOperations(s,[{type:'reorderLayer',layerId:'subject',beforeLayerId:'missing'}])).toThrow();expect(applyOperations(s,[{type:'reorderLayer',layerId:'subject',beforeLayerId:null}]).scene.layers.map(l=>l.id)).toEqual(['anchor','subject']);});
  it('revising identical content does not reuse identity',()=>{const s=fixture(),a=reviseScene(s),b=reviseScene(s);expect(a.revision.id).not.toBe(b.revision.id);expect(a.layers).toEqual(s.layers);});
});

describe('font asset loading',()=>{
  it('matches platform SHA-256 across empty, padded and font-sized inputs',()=>{for(const size of [0,1,55,56,63,64,65,30000]){const bytes=Uint8Array.from({length:size},(_,i)=>i%251);expect(sha256(bytes.buffer)).toBe(createHash('sha256').update(bytes).digest('hex'));}});
  it('loads exactly the explicitly supplied offline font set and rejects failed font loads',async()=>{
    vi.resetModules();const load=vi.fn().mockResolvedValue(undefined),add=vi.fn();vi.stubGlobal('document',{fonts:{add}});vi.stubGlobal('FontFace',class {load=load;constructor(public family:string,public source:string){}});
    const data=(id:string)=>`data:font/woff2;base64,${readFileSync(`apps/web/public/fonts/${id}.woff2`).toString('base64')}`;
    const fonts=await import('../packages/core/src/fonts');await fonts.loadFonts({});expect(load).not.toHaveBeenCalled();await fonts.loadFonts({'space-bold':data('space-bold')});expect(load).toHaveBeenCalledTimes(1);expect(add).toHaveBeenCalledTimes(1);fonts.assertFontReady('space-bold');expect(()=>fonts.assertFontReady('mono-bold')).toThrow();load.mockRejectedValueOnce(Error('missing'));await expect(fonts.loadFonts({'mono-bold':data('mono-bold')})).rejects.toThrow(/Could not load/);await expect(fonts.loadFonts({'mono-bold':'data:font/woff2;base64,YmFk'})).rejects.toThrow(/Could not load/);vi.unstubAllGlobals();
  });
});
