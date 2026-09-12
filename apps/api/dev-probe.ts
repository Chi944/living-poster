import {createOllamaProvider,type AiInput} from './src/provider';
import {validateScene} from '../../packages/core/src/index';
const scene=validateScene({schemaVersion:1,rendererVersion:'1.0.0',id:'dev-probe',revision:{id:'dev-r1',parentId:null},seed:51,artboard:{width:1080,height:1350,background:'#fafafa'},timeline:{durationMs:6000,fps:30,loop:true},fonts:[{id:'space-bold',assetHash:'bundled-v1'}],pointer:{mode:'disabled'},layers:[
  {id:'lead',name:'Display title',kind:'text',text:'OPEN STUDIO',fontId:'space-bold',fontSize:110,lineHeight:1,trackingEm:0,align:'left',fill:'#223344',visible:true,locked:false,opacity:1,layout:{x:120,y:310,rotationDeg:0},behaviors:[]},
  {id:'details',name:'Details',kind:'text',text:'Meet the makers',fontId:'space-bold',fontSize:25,lineHeight:1,trackingEm:0,align:'left',fill:'#223344',visible:true,locked:false,opacity:1,layout:{x:120,y:690,rotationDeg:0},behaviors:[]},
  {id:'badge',name:'Round badge',kind:'shape',shape:'ellipse',width:110,height:110,fill:'#223344',visible:true,locked:false,opacity:1,layout:{x:760,y:800,rotationDeg:0},behaviors:[]},
]});
// Manually invoked, free local development probes; separate from held-out evaluation.
const provider=createOllamaProvider('http://127.0.0.1:11434',process.env.LP_PROBE_MODEL??'qwen3:4b');
if(process.env.LP_PROBE_SET==='ambiguity'&&scene.layers[1].kind==='text')scene.layers[1].text='OPEN STUDIO';
const probes:[string,string[]][]=process.env.LP_PROBE_SET==='ambiguity'?[
 ['Set OPEN STUDIO to dark blue.',[]],
 ['Give that a subtle rotation.',[]],
 ['Change the fill colour.',[]],
 ['Improve this.',[]],
 ['Move the smaller OPEN STUDIO twelve pixels downward.',[]],
 ['Give OPEN STUDIO a float.',['lead']],
 ['Put the round badge into an orbit.',[]],
 ['Make the badge retreat from the pointer.',[]],
]:[
 ['Turn the selected lettering moss green (#668833).',['lead']],
 ['Let OPEN STUDIO drift gently, and shift the round badge 26 pixels right.',[]],
 ['Make it much more interesting.',[]],
 ['Put a photorealistic ocean video behind the lettering.',[]],
 ['The details should be centered, with letters sized at 32 pixels.',[]],
 ['Have the title pull the badge toward it.',[]],
 ['Retain all wording and make the title letters travel in a wave.',[]],
 ['Keep current type sizing. Set the badge fill to #112233 and the title tracking to 0.05 em.',[]],
 ['Move the selected elements eighteen pixels to the left.',['lead','badge']],
 ['Shatter the letters into physically realistic glass shards.',[]],
];
for(const [instruction,selectedLayerIds] of probes) {
 const input:AiInput={requestId:crypto.randomUUID(),scene,selectedLayerIds,instruction,allowTextChanges:false,baseRevisionId:scene.revision.id,requestGeneration:0,mutationEpoch:0};const started=Date.now();
 try{const result=await provider.generate(input,AbortSignal.timeout(120000));console.log(JSON.stringify({instruction,ms:Date.now()-started,...result}));}catch(e){console.log(JSON.stringify({instruction,ms:Date.now()-started,error:String(e)}));}
}
