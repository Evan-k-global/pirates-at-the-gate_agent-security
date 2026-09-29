# Witness

A working proof of concept for controlling agent actions and preserving independently verifiable evidence. No real model or external target is attacked: a browser acts as the untrusted client, and a synthetic package registry is the protected service.

## Can capable agents be constrained before alignment is solved?

For a defined boundary, permissions can be enforced without trusting the planner. This demo permits only reads from the current run’s registry, limits successful reads to three, and rejects writes, other scopes, and replayed operations. The server owns the policy and service operation. This does not establish universal AI containment.

## Can agents rewrite the logs?

The client cannot sign or change the server’s authoritative trace through the API. Each event has a Pallas signature, sequence, previous-event binding, and run/policy binding. Sealing signs the exact ordered trace. The verifier rejects edits, reordering, missing events, and truncated evidence against an expected terminal checkpoint. Clearing the browser view leaves the record intact.

The gateway, signing key, database, and operator are trusted. Storage is logically append-only through the application API, not hardware write-once storage. A compromised recorder could omit events or lie before committing them. Independent retention and trusted checkpoint distribution are still required.

## What happens when monitoring fails?

The recorder-failure test injects a failure before dispatch: no new record or service effect is produced. The synthetic service counter and its signed event update atomically, and concurrent duplicate requests cannot execute twice. This is an injected failure test, not a killed-host, OS escape, or workload-termination test. Real external services require durable authorization, idempotent dispatch, result recording, and crash reconciliation.

## Why use zero-knowledge proofs and a blockchain?

A real o1js proof verifies that the recorder signed the exact reference trace, that its sequence and fixed policy are valid, that replay checks hold, and that the three-read budget was respected. Randomized event fields remain private inputs; the public statement contains the recorder, run/policy commitments, trace root, event count, and dispatch count. The synthetic reference trace is separately disclosed for reproducibility; proof verification itself does not require that disclosure.

The checkpoint contract verifies the proof and pins the recorder key before accepting an immutable trace root. This release is complete without chain publication: it includes the contract, real proof, independent verifier, and optional Zeko Sepolia deployment scripts. No live zkApp address is required. L2 inclusion does not establish Ethereum finality. Signatures, proof validity, chain inclusion, and settlement are reported separately.

Visitor runs have real signed evidence but are not automatically proved or anchored. The reference proof covers at most eight events. A production recorder would need batch aggregation, key rotation, retention, freshness policies, and independent witnesses.

## Does this stop SSRF or create an air gap?

No. The demo rejects an external-destination request without making a network request. It does not test a vulnerable proxy, DNS rebinding, kernel exploitation, or physical isolation. Real deployments must constrain both agent and downstream-service egress, remove alternate credentials and shared writable channels, and use isolated synthetic evaluation infrastructure. An air-gapped deployment records locally in a separate trusted domain and exports reviewed evidence offline; it does not connect the agent to a blockchain.

## Run and verify

Use the on-page adversarial suite, then **Seal & verify**, **Tamper with a copy**, and **Clear client view**. Download the evidence and source to verify independently.

```sh
# Node 22+; from the source archive's witness-demo directory
npm ci
cd proof
npm ci
npm run verify
```

The verifier pins the reference recorder and proof verification-key digest. To regenerate the proof, run `npm run prove` inside `proof/`. This compiles and proves with real cryptography; it does not use proofs-disabled simulation. The reference transcript is captured from the same gateway implementation via `scripts/tests/gateway.mjs`.

To run your own gateway, use `npm run setup:local` from the project root, then follow `DEVELOPMENT.md`. This creates your own secret and browser trust pin while preserving the independently verifiable reference proof. No wallet or blockchain funds are needed for the demo.

Optional chain publication is documented in `SEPOLIA.md`: generate your own deployment keys, run the read-only network preflight, then deploy and verify if desired. No original operator keys or reserved address are needed. Never put a private key in the browser, evidence bundle, or source archive.
