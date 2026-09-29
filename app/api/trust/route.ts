import {trust} from '@/lib/witness/server';
export function GET(){try{return Response.json(trust(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Recorder unavailable'},{status:503});}}
