import fs from 'node:fs';
import {preflight} from './network.mjs';
const result=await preflight();
if(process.argv.includes('--save'))fs.writeFileSync(new URL('../public/evidence/sepolia-preflight.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
