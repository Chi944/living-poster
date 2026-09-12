import {afterEach,expect,it,vi} from 'vitest';
import {api,post} from './api';
afterEach(()=>vi.unstubAllGlobals());
it('does not advertise an empty JSON body on share revocation',async()=>{
 const fetch=vi.fn(async(_input:RequestInfo|URL,_options?:RequestInit)=>new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 await api('/shares/share-1',{method:'DELETE'});
 const options=fetch.mock.calls[0][1] as RequestInit;
 expect(options.method).toBe('DELETE');expect(options.body).toBeUndefined();expect(options.headers).not.toHaveProperty('Content-Type');
});
it('still marks serialized request bodies as JSON',async()=>{
 const fetch=vi.fn(async(_input:RequestInfo|URL,_options?:RequestInit)=>new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 await post('/auth/logout',{});
 const options=fetch.mock.calls[0][1] as RequestInit;
 expect(options.body).toBe('{}');expect(options.headers).toHaveProperty('Content-Type','application/json');
});

