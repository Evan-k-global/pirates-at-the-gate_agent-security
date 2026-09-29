// mina-signer only uses this create/update/array API for Base58 checksums.
// Use a pure implementation because dynamic require/eval is unavailable in Workers.
import {sha256 as hash} from '@noble/hashes/sha256';
export const sha256={create(){const h=hash.create();return {update(bytes:number[]|Uint8Array){h.update(Uint8Array.from(bytes));return this;},array(){return Array.from(h.digest());}};}};
