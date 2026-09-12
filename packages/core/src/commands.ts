import {z} from 'zod';
import {BehaviorSchema, LayoutSchema, TypographySchema, TextLayerSchema, validateScene, reviseScene, type Scene} from './schema';
const id=z.string().min(1).max(100);
export const EditOperationSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('setLayout'),layerId:id,changes:LayoutSchema.partial().refine(v=>Object.keys(v).length>0,'Provide a layout change')}).strict(),
  z.object({type:z.literal('setTypography'),layerId:id,changes:TypographySchema.partial().refine(v=>Object.keys(v).length>0,'Provide a typography change')}).strict(),
  z.object({type:z.literal('setFill'),layerId:id,colour:TextLayerSchema.shape.fill}).strict(),
  z.object({type:z.literal('setOpacity'),layerId:id,value:z.number().finite().min(0).max(1)}).strict(),
  z.object({type:z.literal('upsertBehavior'),layerId:id,behavior:BehaviorSchema}).strict(),
  z.object({type:z.literal('removeBehavior'),layerId:id,behaviorId:id}).strict(),
  z.object({type:z.literal('setText'),layerId:id,expectedOldText:z.string().max(4096),newText:z.string().max(4096)}).strict(),
  z.object({type:z.literal('reorderLayer'),layerId:id,beforeLayerId:id.nullable()}).strict(),
]);
export type EditOperation=z.infer<typeof EditOperationSchema>;
export function applyOperations(scene:Scene,operations:EditOperation[],options:{allowTextChanges?:boolean}={}):{scene:Scene,affectedLayerIds:string[],summary:string} {
  validateScene(scene);
  const ops=z.array(EditOperationSchema).min(1).max(20).parse(operations),next=structuredClone(scene);
  for(const op of ops) {
    const layer=next.layers.find(l=>l.id===op.layerId);if(!layer)throw new Error(`Layer ${op.layerId} does not exist`);
    switch(op.type) {
      case 'setLayout':Object.assign(layer.layout,op.changes);break;
      case 'setTypography':if(layer.kind!=='text')throw new Error('Typography requires a text layer');Object.assign(layer,op.changes);break;
      case 'setFill':layer.fill=op.colour;break;
      case 'setOpacity':layer.opacity=op.value;break;
      case 'upsertBehavior': {const index=layer.behaviors.findIndex(b=>b.id===op.behavior.id);if(index>=0)layer.behaviors[index]=structuredClone(op.behavior);else layer.behaviors.push(structuredClone(op.behavior));break;}
      case 'removeBehavior': {const index=layer.behaviors.findIndex(b=>b.id===op.behaviorId);if(index<0)throw new Error('Behavior does not exist on the target layer');layer.behaviors.splice(index,1);break;}
      case 'setText':if(!options.allowTextChanges)throw new Error('Wording changes are disabled');if(layer.kind!=='text')throw new Error('Wording requires a text layer');if(layer.text!==op.expectedOldText)throw new Error('Text has changed since this edit was requested');layer.text=op.newText;break;
      case 'reorderLayer': {if(op.beforeLayerId===layer.id)throw new Error('Cannot place a layer before itself');if(op.beforeLayerId!==null&&!next.layers.some(l=>l.id===op.beforeLayerId))throw new Error('Reorder target does not exist');next.layers.splice(next.layers.indexOf(layer),1);const at=op.beforeLayerId===null?next.layers.length:next.layers.findIndex(l=>l.id===op.beforeLayerId);next.layers.splice(at,0,layer);break;}
    }
  }
  validateScene(next);
  const affectedLayerIds=next.layers.filter((l,i)=>JSON.stringify(l)!==JSON.stringify(scene.layers.find(o=>o.id===l.id))||scene.layers[i]?.id!==l.id).map(l=>l.id);
  const names=affectedLayerIds.map(id=>next.layers.find(l=>l.id===id)!.name);
  return {scene:reviseScene(next),affectedLayerIds,summary:names.length?`Updated ${names.join(', ')}.`:'No visible properties changed.'};
}
