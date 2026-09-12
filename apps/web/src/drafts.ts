import {openDB} from 'idb';
import type {Scene} from '../../../packages/core/src';
export type OutboxItem = {id:string; documentId:string; projectId:string|null; name:string; scene:Scene; expectedHeadRevisionId:string|null;blocked?:boolean;};
export type Recovery = {scene:Scene;documentId:string;projectId:string|null;serverHead:string|null;name:string;outbox:OutboxItem[];};
const db = ()=>openDB('living-poster',1,{upgrade(db){db.createObjectStore('workspace');}});
export async function recoverDraft():Promise<Recovery|undefined>{const d=await db();return d.get('workspace','current');}
export type ArchivedDraft=Recovery&{updatedAt:number};
export async function recentDrafts():Promise<ArchivedDraft[]>{const d=await db();const rows=await d.getAll('workspace');return rows.filter((row:any)=>row?.updatedAt&&row?.documentId).sort((a:any,b:any)=>b.updatedAt-a.updatedAt);}
let chain:Promise<unknown> = Promise.resolve();
export function archiveDraft(draft:Recovery):Promise<void>{const copy={...structuredClone(draft),updatedAt:Date.now()};const next=chain.catch(()=>{}).then(async()=>{const d=await db();await d.put('workspace',copy,`draft:${draft.documentId}`);});chain=next;return next;}
export function updateArchivedHead(documentId:string,projectId:string,serverHead:string):Promise<void>{const next=chain.catch(()=>{}).then(async()=>{const d=await db();const archived=await d.get('workspace',`draft:${documentId}`);if(archived)await d.put('workspace',{...archived,projectId,serverHead},`draft:${documentId}`);});chain=next;return next;}
export function persistDraft(draft:Recovery):Promise<void>{
  const copy=structuredClone(draft);
  const next=chain.catch(()=>{}).then(async()=>{const d=await db();const tx=d.transaction('workspace','readwrite');await tx.store.put(copy,'current');await tx.store.put({...copy,updatedAt:Date.now()},`draft:${copy.documentId}`);await tx.done;});
  chain=next;return next;
}
