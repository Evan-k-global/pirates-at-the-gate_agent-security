# Optional Zeko Sepolia checkpoint

The source package is complete without a live checkpoint. The browser demo, signature verification, supplied real policy proof, and local contract tests do not need a funded wallet, deployed address, or Ethereum settlement. No transaction was submitted for this release.

## Configuration checked

| Setting | Required value |
| --- | --- |
| Sequencer GraphQL | `https://sepolia.zeko.io/graphql` |
| o1js signing domain | `testnet` |
| RPC network label | `zeko:testnet` |
| RPC L2 chain ID | `69420` (not Ethereum L1 chain ID) |
| Native fee asset | sETH, 9 decimal places |
| Configured fee per transaction | `10000` base units by default |

The generic Mina-backed Zeko testnet endpoint and the `zeko:sepolia` display label must not be used as this deployment's endpoint/signing domain. `proof/network.mjs` rejects those substitutions. It checks the live node's signature kind, synchronization, chain identity, account creation fee and fee-per-weight-unit. The configured total fee is not a live transaction-weight quote; adjust `WITNESS_TX_FEE` if the sequencer requires more. The script caps it at 1,000,000 base units and never retries a rejected transaction with a higher fee automatically.

`public/evidence/sepolia-preflight.json` records the release's read-only network check. Rerun it close to any submission; fees and network state can change. The checks use a trusted TLS RPC, not a light-client consensus proof.

## Recipient deployment (optional)

From a fresh extracted package, install root dependencies with `npm ci`, then:

```sh
cd proof
npm ci
npm run verify                 # independently verify the supplied real proof
npm run setup:deployment       # fresh deployer + checkpoint keys, no network writes
export ZEKO_GRAPHQL=https://sepolia.zeko.io/graphql
export ZEKO_NETWORK_ID=testnet
npm run preflight              # read-only live network checks, no funding needed
```

The initializer writes private keys only to ignored `proof/private/` files with mode 0600, prints only public addresses, and records the checkpoint address in `config/checkpoint-target.json`. Back up those keys securely. It refuses to overwrite an existing identity. A recipient needs no original recorder/deployer secret to publish the included historical reference proof.

Only if choosing to publish, fund the printed **deployer** on Zeko Sepolia L2 with native sETH sufficient for one account creation and two transactions. Do not send Ethereum L1 ETH or an FT to the checkpoint address. Then:

```sh
npm run deploy
npm run verify
```

Deployment compiles the actual contract, verifies the supplied proof, fetches the inferred payer nonce close to each build, rechecks it after proving, checks the live account creation cost, and signs only with recipient-owned keys. The standard o1js fee payer signs the full commitment; no browser-wallet fee-payer rewriting is needed. It records submission state before sending and transaction hashes before polling. RPC failures are not treated as absent accounts. An unknown outcome or unresolved prior hash blocks blind resubmission; reconcile the public record, payer nonce, and exact contract state before resuming. Do not run concurrent deployments with the same payer.

Success records exact root/run/count/dispatch state and verification-key hash in `public/evidence/deployment.json`. The independent verifier requires that state, the pinned release contract key, and the separately configured checkpoint address to match. Review and distribute the public target config through a trusted channel; never adopt a target solely from an untrusted evidence bundle. Rebuild the web app after optional deployment to expose the live check and updated evidence.

## What was and was not tested

- Real policy proof generation and verification; negative policy and tampering checks.
- Real-proofs-enabled local contract deployment, publication, repeat-publication rejection, and signing-key rewrite rejection.
- Read-only checks against the live Sepolia endpoint.
- Fresh recipient key initialization and standalone package verification.
- Live transaction submission, L2 inclusion, and Ethereum settlement are intentionally not performed or claimed.

This is an application checkpoint contract, not the Zeko sequencer, bridge, DA, or Ethereum settlement stack. Relevant official background: [custom-network configuration](https://docs.zeko.io/developers/guides/custom-network) and [Sepolia operations runbook](https://ethereum.docs.zeko.io/operations/testnet). The older generic custom-network example uses a different network configuration; use the explicit Sepolia settings above for this package. Settlement availability and finality must be checked separately by an operator choosing to rely on them.
