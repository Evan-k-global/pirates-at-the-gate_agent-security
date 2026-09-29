# Reproducing the experiment

## App

Node 22 or later is required. Install dependencies with `npm ci`.

Generate a Pallas recorder key using `mina-signer` and store it only in `.env` as `WITNESS_RECORDER_KEY`. This source release pins the published recorder in its browser verifier, proof constants, and independent verifier. A fork must explicitly update all three trust roots and recompile its contract; merely replacing the key is insufficient.

The schema is in `db/schema.ts`. Build with `npm run build`, then initialize a new local database with:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fast_arclight.sql
npm run dev
```

Run the API tests against the printed URL:

```sh
WITNESS_BASE_URL=http://127.0.0.1:5173 node scripts/tests/gateway.mjs
```

Set `WITNESS_SAVE_REFERENCE=1` only when intentionally replacing reference evidence. Replacing the reference requires regenerating its proof and deploying a new immutable checkpoint.

The public API has fixed synthetic operations only; it never fetches a caller-supplied URL or executes shell commands. Sessions use HttpOnly, SameSite cookies and a random capability token stored hashed in D1. Runs expire for API access after 24 hours; evidence exported before expiry remains verifiable. Runs are capped at 8 events and creation is limited to 30 per IP per hour. Raw IPs are not persisted. Public reference evidence has no session credential or secret key.

## Proof and trust

`proof/Witness.ts` defines the policy program and immutable checkpoint contract. The private witness contains exactly eight slots, with zero padding after the event count. A terminal recorder signature authenticates the complete ordered, padded batch. The circuit verifies that signature, event sequences, operation/scope vocabulary, healthy-recorder flags, nonce reuse, policy decisions, dispatch equality, budget, and Poseidon trace commitment.

The external verifier additionally checks individual event signatures and the SHA-256-derived previous-event chain. The circuit authenticates the entire batch directly; it does not claim to recompute the SHA-256 chain. Neither proves completeness of observations outside the gateway.

`proof/verify.mjs` verifies the disclosed reference trace, checks its commitment against the public proof statement, verifies the real proof using a pinned verification-key digest, and, when deployed, checks the live contract state and contract key hash. The live RPC is a trust dependency; a full independent chain verifier is outside this POC.

```sh
cd proof
npm install
npm run build
node compile.mjs
node prove.mjs
node verify.mjs
```

`proof/deploy.mjs` requires a funded Zeko Sepolia testnet deployer and a fresh checkpoint key in ignored `proof/private/` files. It enforces a small testnet fee ceiling and records transaction hashes before confirmation polling. It must never be pointed at a production network. Deployment is immutable per run: it verifies the proof and pins the recorder key, and it cannot replace a nonzero root through its publish method.

## Limits

The recorder and gateway share one trusted Worker administration boundary and database. They are independent of the untrusted browser, not independently administered from each other. The synthetic read effect and record are a single database mutation; this is deliberately narrower than exactly-once effects on arbitrary external services. The outage scenario is controlled fault injection. The demo does not include a Linux sandbox, packet-level egress tests, actual model behavior, OS shutdown, independent storage witnesses, a TEE, or general-purpose recursive log aggregation.

The public reference trace is synthetic and intentionally disclosed. Visitor records are session-gated and contain numeric synthetic events. No claim of end-to-end log encryption is made. Production private payloads require encrypted storage, access control, retention, and disclosure policies; commitments do not preserve deleted data or eliminate metadata leakage.
