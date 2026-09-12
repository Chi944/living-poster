import {validateScene,graphemes,type Scene,type Layer,type TextLayer,type FontId,type Behavior,type PointerSample} from './schema';
import {assertFontReady,fontCss} from './fonts';
import {loopTime} from './pointer';
export interface Bounds {x:number;y:number;width:number;height:number}
export interface GlyphMetrics {width:number;left:number;right:number;ascent:number;descent:number}
export type GlyphMeasurer=(fontId:FontId,fontSize:number,text:string)=>GlyphMetrics;
interface BaseUnit {kind:'glyph'|'rect'|'ellipse';layerId:string;index:number;x:number;y:number;width:number;height:number;text?:string;font?:string;offsetX:number;offsetY:number;cornerRadius:number}
export interface CompiledLayer {layer:Layer;units:BaseUnit[];baseBounds:Bounds|null}
export interface CompiledScene {scene:Scene;layers:CompiledLayer[];pivots:Record<string,{x:number;y:number}>;glyphCount:number;behaviorCount:number}
export interface DrawUnit {kind:'glyph'|'rect'|'ellipse';layerId:string;index:number;x:number;y:number;width:number;height:number;rotationDeg:number;fill:string;opacity:number;text?:string;font?:string;offsetX:number;offsetY:number;cornerRadius:number;bounds:Bounds}
export interface Frame {width:1080;height:1350;background:string;units:DrawUnit[];bounds:Record<string,Bounds>;baseBounds:Record<string,Bounds>;boundsCorrections:number;glyphCount:number;behaviorCount:number}
let measurementContext:CanvasRenderingContext2D|null=null;
const metricCache=new Map<string,GlyphMetrics>();
function browserMeasure(fontId:FontId,fontSize:number,text:string):GlyphMetrics {
  assertFontReady(fontId);
  const key=`${fontId}|${fontSize}|${text}`;const cached=metricCache.get(key);if(cached)return cached;
  if(!measurementContext){if(typeof document==='undefined')throw new Error('Text layout requires a loaded browser font');measurementContext=document.createElement('canvas').getContext('2d');}
  if(!measurementContext)throw new Error('Canvas 2D is unavailable');
  const c=measurementContext;c.font=fontCss(fontId,fontSize);c.fontKerning='none';c.textAlign='left';c.textBaseline='alphabetic';c.direction='ltr';c.letterSpacing='0px';c.wordSpacing='0px';
  const m=c.measureText(text),result={width:m.width,left:m.actualBoundingBoxLeft,right:m.actualBoundingBoxRight,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent};
  if(Object.values(result).some(v=>!Number.isFinite(v)))throw new Error(`Font metrics failed for ${fontId}`);
  if(metricCache.size>8192)metricCache.clear();metricCache.set(key,result);return result;
}
const DEG=Math.PI/180;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const rotate=(x:number,y:number,angle:number)=>({x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)});
function dimensions(width:number,height:number,angle:number):{width:number;height:number} {return {width:Math.abs(width*Math.cos(angle))+Math.abs(height*Math.sin(angle)),height:Math.abs(width*Math.sin(angle))+Math.abs(height*Math.cos(angle))};}
function unitBounds(x:number,y:number,width:number,height:number,angle:number):Bounds {const d=dimensions(width,height,angle);return {x:x-d.width/2,y:y-d.height/2,width:d.width,height:d.height};}
function union(a:Bounds|null,b:Bounds):Bounds {if(!a)return {...b};const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y};}
function baseBounds(l:Layer,u:BaseUnit):Bounds {const p=rotate(u.x,u.y,l.layout.rotationDeg*DEG);return unitBounds(l.layout.x+p.x,l.layout.y+p.y,u.width,u.height,l.layout.rotationDeg*DEG);}
function layoutText(l:TextLayer,measure:GlyphMeasurer):BaseUnit[] {
  const units:BaseUnit[]=[];let index=0;
  for(const [lineIndex,line] of l.text.split('\n').entries()) {
    const chars=graphemes(line),metrics=chars.map(g=>measure(l.fontId,l.fontSize,g));
    const advance=metrics.reduce((sum,m)=>sum+m.width,0)+Math.max(0,chars.length-1)*l.fontSize*l.trackingEm;
    let cursor=l.align==='center'?-advance/2:l.align==='right'?-advance:0;
    for(let i=0;i<chars.length;i++,index++) {
      const m=metrics[i]!,text=chars[i]!;
      if(text.trim()&&m.right+m.left>0&&m.ascent+m.descent>0) {
        const cx=(m.right-m.left)/2,cy=(m.descent-m.ascent)/2;
        units.push({kind:'glyph',layerId:l.id,index,x:cursor+cx,y:lineIndex*l.fontSize*l.lineHeight+cy,width:m.left+m.right,height:m.ascent+m.descent,text,font:fontCss(l.fontId,l.fontSize),offsetX:-cx,offsetY:-cy,cornerRadius:0});
      }
      cursor+=m.width+l.fontSize*l.trackingEm;
    }
    index++; // Explicit line breaks retain their stable grapheme index too.
  }
  return units;
}
/** Optional metrics injection is for deterministic engineering fixtures, never a browser fallback. */
export function compileScene(input:Scene,measure:GlyphMeasurer=browserMeasure):CompiledScene {
  const scene=validateScene(input),pivots:CompiledScene['pivots']=Object.create(null);let glyphCount=0,behaviorCount=0;
  const layers=scene.layers.map(layer=>{
    pivots[layer.id]={x:layer.layout.x,y:layer.layout.y};behaviorCount+=layer.behaviors.length;
    if(layer.kind==='text'&&measure===browserMeasure)assertFontReady(layer.fontId);
    const units:BaseUnit[]=layer.kind==='text'?layoutText(layer,measure):[{kind:layer.shape,layerId:layer.id,index:0,x:0,y:0,width:layer.width,height:layer.height,offsetX:0,offsetY:0,cornerRadius:layer.cornerRadius??0}];
    if(layer.kind==='text')glyphCount+=graphemes(layer.text).length;
    let box:Bounds|null=null;
    for(const unit of units) {
      const bounds=baseBounds(layer,unit);box=union(box,bounds);
      if(bounds.x<16-1e-7||bounds.y<16-1e-7||bounds.x+bounds.width>1064+1e-7||bounds.y+bounds.height>1334+1e-7)throw new Error(`“${layer.name}” extends outside the 16-unit margin. Move it inward, insert a line break, or reduce its size.`);
      // A rectangle's diagonal is an upper bound at every possible animated orientation.
      // Glyph maximum size is 300; shape maximum is 640, so both fit the 1048-unit width.
      if(Math.hypot(unit.width,unit.height)>1048)throw new Error(`A drawn unit in “${layer.name}” is too large to rotate safely.`);
    }
    return {layer,units,baseBounds:box};
  });
  return {scene,layers,pivots,glyphCount,behaviorCount};
}
const smooth=(u:number)=>{const v=clamp(u,0,1);return v*v*(3-2*v);};
const limit=(x:number,y:number,max:number)=>{const length=Math.hypot(x,y);return length>max?{x:x*max/length,y:y*max/length}:{x,y};};
/** FNV-1a followed by Mulberry32, keyed only by immutable scene/layer/behavior/index. */
function scatterVector(seed:number,layerId:string,behaviorId:string,index:number,radius:number,angle:number):{x:number;y:number;angle:number} {
  let h=(2166136261^seed)>>>0;const key=`${layerId}\0${behaviorId}\0${index}`;
  for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  const random=()=>{h=(h+0x6d2b79f5)>>>0;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const theta=random()*2*Math.PI,r=Math.sqrt(random())*radius;return {x:Math.cos(theta)*r,y:Math.sin(theta)*r,angle:(random()*2-1)*angle};
}
function phase(b:Behavior,t:number):number|null {return !b.enabled||t<b.startMs||t>=b.endMs?null:(t-b.startMs)/(b.endMs-b.startMs);}
function scatterEnvelope(u:number,outEnd:number,returnStart:number):number {return u<outEnd?smooth(u/outEnd):u<=returnStart?1:1-smooth((u-returnStart)/(1-returnStart));}
const ORDER=['float','orbit','scatter','attract','repel'] as const;
export function evaluateScene(compiled:CompiledScene,input:{timeMs:number;pointer:PointerSample|null}):Frame {
  if(!Number.isFinite(input.timeMs)||input.pointer&&Object.values(input.pointer).some(v=>!Number.isFinite(v)))throw new Error('Evaluation requires finite time and pointer coordinates');
  const {scene}=compiled,t=loopTime(input.timeMs,scene.timeline.durationMs);
  const frame:Frame={width:1080,height:1350,background:scene.artboard.background,units:[],bounds:Object.create(null),baseBounds:Object.create(null),boundsCorrections:0,glyphCount:compiled.glyphCount,behaviorCount:compiled.behaviorCount};
  for(const {layer:l,units,baseBounds:base} of compiled.layers) {
    if(base)frame.baseBounds[l.id]=base;
    if(!l.visible||l.opacity===0)continue;
    let dx=0,dy=0,commonAngle=0;
    for(const type of ORDER) {
      const b=l.behaviors.find(b=>b.type===type);if(!b)continue;const u=phase(b,t);if(u===null||u===0)continue;
      const e=Math.sin(Math.PI*u)**2;
      switch(b.type) {
        case 'float': {const a=2*Math.PI*b.params.cycles*u+b.params.phase;dx+=e*b.params.amplitudeX*Math.sin(a);dy+=e*b.params.amplitudeY*Math.cos(a);commonAngle+=e*b.params.rotationAmplitudeDeg*Math.sin(a);break;}
        case 'orbit': {const a=b.params.anchor,point=a.type==='point'?a:compiled.pivots[a.layerId]!,x=l.layout.x-point.x,y=l.layout.y-point.y,rot=rotate(x,y,2*Math.PI*b.params.direction*b.params.cycles*smooth(u));dx+=rot.x-x;dy+=rot.y-y;break;}
        case 'scatter': {if(b.scope==='glyph')break;const v=scatterVector(scene.seed,l.id,b.id,-1,b.params.radius,b.params.rotationMaxDeg),h=scatterEnvelope(u,b.params.outEnd,b.params.returnStart);dx+=v.x*h;dy+=v.y*h;commonAngle+=v.angle*h;break;}
        case 'attract': {const a=b.params.anchor,point=a.type==='point'?a:compiled.pivots[a.layerId]!,v=limit(point.x-l.layout.x,point.y-l.layout.y,b.params.maxDistance);dx+=v.x*e*b.params.strength;dy+=v.y*e*b.params.strength;break;}
        case 'repel': {const p=input.pointer;if(!p)break;const x=l.layout.x-p.x,y=l.layout.y-p.y,r=Math.hypot(x,y),f=e*clamp(p.presence,0,1)*b.params.maxDistance*Math.max(0,1-r/b.params.radius)**2/Math.sqrt(r*r+256);dx+=x*f;dy+=y*f;break;}
      }
    }
    const offset=limit(dx,dy,240);commonAngle=clamp(commonAngle,-25,25);
    for(const unit of units) {
      let gx=0,gy=0,gAngle=0;
      for(const b of l.behaviors) {
        if(b.scope!=='glyph')continue;const u=phase(b,t);if(u===null||u===0)continue;
        if(b.type==='wave')gy+=Math.sin(Math.PI*u)**2*b.params.amplitude*Math.sin(2*Math.PI*b.params.cycles*u-2*Math.PI*unit.index/b.params.wavelength+b.params.phase);
        if(b.type==='scatter'){const v=scatterVector(scene.seed,l.id,b.id,unit.index,b.params.radius,b.params.rotationMaxDeg),h=scatterEnvelope(u,b.params.outEnd,b.params.returnStart);gx+=v.x*h;gy+=v.y*h;gAngle+=v.angle*h;}
      }
      const local=limit(gx,gy,180),p=rotate(unit.x+local.x,unit.y+local.y,(l.layout.rotationDeg+commonAngle)*DEG);
      let x=l.layout.x+p.x+offset.x,y=l.layout.y+p.y+offset.y;
      const rotationDeg=l.layout.rotationDeg+clamp(commonAngle+gAngle,-25,25),box=unitBounds(x,y,unit.width,unit.height,rotationDeg*DEG);
      const correctionX=box.x<16?16-box.x:box.x+box.width>1064?1064-box.x-box.width:0;
      const correctionY=box.y<16?16-box.y:box.y+box.height>1334?1334-box.y-box.height:0;
      if(correctionX||correctionY){frame.boundsCorrections++;x+=correctionX;y+=correctionY;box.x+=correctionX;box.y+=correctionY;}
      const draw:DrawUnit={...unit,x,y,rotationDeg,fill:l.fill,opacity:l.opacity,bounds:box};frame.units.push(draw);frame.bounds[l.id]=union(frame.bounds[l.id]??null,box);
    }
  }
  return frame;
}
export function paintFrame(ctx:CanvasRenderingContext2D,frame:Frame,scale=1):void {
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Paint scale must be positive');
  ctx.save();ctx.setTransform(scale,0,0,scale,0,0);ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.globalAlpha=1;ctx.fillStyle=frame.background;ctx.fillRect(0,0,frame.width,frame.height);ctx.beginPath();ctx.rect(0,0,frame.width,frame.height);ctx.clip();
  ctx.fontKerning='none';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.direction='ltr';ctx.letterSpacing='0px';ctx.wordSpacing='0px';
  for(const unit of frame.units) {
    ctx.save();ctx.translate(unit.x,unit.y);ctx.rotate(unit.rotationDeg*DEG);ctx.fillStyle=unit.fill;ctx.globalAlpha=unit.opacity;
    if(unit.kind==='glyph'){ctx.font=unit.font!;ctx.fillText(unit.text!,unit.offsetX,unit.offsetY);}
    else {ctx.beginPath();if(unit.kind==='ellipse')ctx.ellipse(0,0,unit.width/2,unit.height/2,0,0,Math.PI*2);else if(unit.cornerRadius)ctx.roundRect(-unit.width/2,-unit.height/2,unit.width,unit.height,unit.cornerRadius);else ctx.rect(-unit.width/2,-unit.height/2,unit.width,unit.height);ctx.fill();}
    ctx.restore();
  }
  ctx.restore();
}
export function hitTest(frame:Frame,x:number,y:number):string|null {
  for(let i=frame.units.length-1;i>=0;i--){const u=frame.units[i]!,p=rotate(x-u.x,y-u.y,-u.rotationDeg*DEG);if(Math.abs(p.x)<=u.width/2&&Math.abs(p.y)<=u.height/2&&(u.kind!=='ellipse'||(p.x/(u.width/2))**2+(p.y/(u.height/2))**2<=1))return u.layerId;}
  return null;
}
