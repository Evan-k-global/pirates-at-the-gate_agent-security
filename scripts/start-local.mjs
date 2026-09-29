import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
const result=spawnSync(process.execPath,['--import',file('scripts/sites-env.mjs'),file('node_modules/wrangler/bin/wrangler.js'),'dev','--config',file('dist/server/wrangler.json'),'--local','--persist-to',file('.wrangler/state'),'--ip','127.0.0.1','--inspector-port','0','--env-file',file('.env'),...process.argv.slice(2)],{stdio:'inherit',cwd:file('.')});
if(result.error)throw result.error;process.exit(result.status??1);
