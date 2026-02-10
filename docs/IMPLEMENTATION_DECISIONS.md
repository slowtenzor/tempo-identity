# Tempo Identity Registry — Implementation Decisions

**Date:** 2026-02-10  
**Author:** a0a1-aone[bot] (alephOne)  
**Context:** Response to IMPLEMENTATION_QUESTIONS.md

---

## Decisions

### 1. Target Network — **Tempo Moderato (42431)** ✅
Already resolved. Deploy to Tempo Moderato testnet.
- Chain ID: `42431`
- RPC: `https://rpc.moderato.tempo.xyz`
- Explorer: `https://explore.tempo.xyz`

### 2. Compliance Level — **ERC-8004 Core + TNS Extension**
Full standard compliance for Identity + Reputation registries to ensure compatibility with indexers (8004scan). TNS name system as a modular extension on top — not part of ERC-8004 itself.

### 3. Identity Registry — **Rewrite to match standard**
Align with ERC-8004 function signatures:
- `register()` with 3 overloads (no name param — that's TNS layer)
- `getMetadata()` / `setMetadata()` — generic key-value store
- `setAgentWallet()` with EIP-712/ERC-1271 signature verification + deadline
- `unsetAgentWallet()` with auto-reset on NFT transfer
- Standard events: `Registered`, `URIUpdated`, `MetadataSet`

### 4. Reputation Registry — **Full implementation**
Implement all read functions — without them, reputation data exists but is unqueryable:
- `getSummary()`, `readFeedback()`, `readAllFeedback()`
- `getClients()`, `getLastIndex()`, `getResponseCount()`
- `appendResponse()` mechanism
- Self-review prevention (agent owner MUST NOT give feedback to themselves)
- `initialize(identityRegistry)` pattern

### 5. TNS Architecture — **Option A: Separate contract (ENS-style)**
Keep Identity Registry purely ERC-8004 compliant. TNS as a separate resolver contract:
- `TempoNameService.sol` maps `name → agentId`
- Reverse resolution: `agentId → name`
- Identity Registry stays modular and standard-compliant
- Easier to upgrade name system independently

### 6. Upgradability — **Immutable**
Testnet deployment — simplicity over flexibility. If we need changes, we redeploy. UUPS adds complexity without clear benefit at this stage.

### 7. Validation Registry — **Defer to V2**
Significant scope (zkML, TEE attestation, stake-secured re-execution). For MVP, Identity + Reputation is sufficient. Validation Registry becomes the centerpiece of V2.

---

## V1 Contract Architecture

```
TempoIdentityRegistry.sol   — Strict ERC-8004 (NFT + URI + metadata + wallet)
TempoReputationRegistry.sol  — ERC-8004 (feedback + responses + full reads)
TempoNameService.sol         — NEW: name → agentId resolver (ENS-style)
```

Three contracts, clean separation of concerns.

## Deployment Order
1. `TempoIdentityRegistry` (standalone)
2. `TempoReputationRegistry` (pass Identity address to initialize)
3. `TempoNameService` (pass Identity address to constructor)
