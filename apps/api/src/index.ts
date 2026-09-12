import { buildServer } from './server';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if(existsSync('.env'))loadEnvFile('.env');
const server=await buildServer();
await server.listen({port:Number(process.env.PORT??4317),host:process.env.LP_HOST??'127.0.0.1'});
console.log(`Living Poster is ready at http://${process.env.LP_HOST??'127.0.0.1'}:${process.env.PORT??4317}. All processing stays local.`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
