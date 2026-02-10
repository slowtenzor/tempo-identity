# Tempo Identity Registry — Implementation Questions

**Date:** 2026-02-10  
**Context:** Pre-implementation review of ERC-8004 compliance gaps

---

## 🔴 Critical Questions

### 1. Target Network — ChainId Mismatch

`SPEC_V1.md` specifies ChainId `5042002`, but this is actually **ARC Testnet**. The actual Tempo Testnet (Andantino) has different parameters:

| Parameter | SPEC_V1.md | Tempo Andantino (actual) | ARC Testnet |
|---|---|---|---|
| ChainId | 5042002 | **42429** | 5042002 |
| RPC | `rpc.testnet.tempo.network` | `https://rpc.testnet.tempo.xyz` | `https://rpc.testnet.arc.network` |
| Explorer | — | `https://explore.testnet.tempo.xyz` | `https://testnet.arcscan.app` |
| Native Currency | — | USD (6 decimals) | USDC (18 decimals) |

**→ Question: Which network should we deploy to? Tempo Andantino (42429) or ARC Testnet (5042002)?**

---

### 2. ERC-8004 Compliance Level

Current scaffold is significantly simplified compared to the full ERC-8004 standard. Three possible approaches:

1. **Strict ERC-8004** — Full implementation of all 3 registries (Identity, Reputation, Validation) with exact function signatures from the spec. Ensures compatibility with 8004scan and other indexers.
2. **ERC-8004 Core + TNS Extension** — Identity + Reputation per standard, TNS name system as an extension on top. Skip Validation Registry for now.
3. **Simplified MVP (current scaffold)** — Keep basic functionality without strict standard compliance.

**→ Question: Which approach do we take?**

---

## 🟡 Architecture Questions

### 3. Identity Registry — Gaps vs ERC-8004

The current `TempoIdentityRegistry.sol` has the following gaps:

| Feature | Current Scaffold | ERC-8004 Standard |
|---|---|---|
| `register()` | `register(name, agentURI)` with unique name | 3 overloads: `register()`, `register(agentURI)`, `register(agentURI, metadata[])` — **no name parameter** |
| On-chain metadata | ❌ missing | `getMetadata()` / `setMetadata()` — generic key-value store |
| `setAgentWallet()` | Simple change, no verification | Requires EIP-712/ERC-1271 signature from new wallet + deadline |
| `unsetAgentWallet()` | ❌ missing | Present; auto-reset on NFT transfer |
| Events | `AgentRegistered` | `Registered`, `URIUpdated`, `MetadataSet` |
| Name system | Built into contract | **Not part of ERC-8004** — this is the TNS extension |

**→ Question: Do we rewrite the Identity Registry to match ERC-8004 signatures exactly, adding TNS as an extension layer?**

---

### 4. Reputation Registry — Gaps vs ERC-8004

The current `TempoReputationRegistry.sol` has the following gaps:

| Feature | Current Scaffold | ERC-8004 Standard |
|---|---|---|
| Initialization | Constructor-based | `initialize(identityRegistry)` pattern |
| `appendResponse()` | ❌ missing | Anyone can append a response to feedback |
| Read functions | ❌ missing | `getSummary()`, `readFeedback()`, `readAllFeedback()`, `getClients()`, `getLastIndex()`, `getResponseCount()` |
| Self-review prevention | ❌ missing | Agent owner MUST NOT give feedback to themselves |
| Client tracking | ❌ missing | Storage of client list per agent |

**→ Question: Do we implement all read functions and the `appendResponse` mechanism for V1?**

---

### 5. TNS Name System Design

Currently `register(name, agentURI)` makes the name mandatory and embeds it in the Identity Registry. In ERC-8004, names are **not part of the standard**. Two options:

- **Option A:** Name system as a separate resolver contract (ENS-style), keeping IdentityRegistry purely standard-compliant
- **Option B:** Name system as an extension within the same contract (simpler but less modular)

**→ Question: Separate contract (A) or integrated extension (B)?**

---

### 6. Upgradability Pattern

ERC-8004 uses an `initialize()` pattern suggesting proxy-based upgradeability. Options:

- **Immutable deployment** — simpler for testnet MVP, redeploy if needed
- **UUPS Proxy** — OpenZeppelin upgradeable pattern, allows contract logic updates without redeployment

**→ Question: Immutable or upgradeable for testnet deployment?**

---

### 7. Validation Registry

ERC-8004 defines a third contract — **Validation Registry** — for high-stakes scenarios (zkML, TEE attestation, stake-secured re-execution). Features include:
- `validationRequest()` — agents request verification
- `validationResponse()` — validators provide responses
- `getValidationStatus()`, `getSummary()`, `getAgentValidations()`, `getValidatorRequests()`

This significantly increases scope.

**→ Question: Include Validation Registry in V1 scope, or defer to V2?**

---

## Summary of Decisions Needed

| # | Question | Options |
|---|---|---|
| 1 | Target network | Tempo Andantino (42429) / ARC Testnet (5042002) |
| 2 | Compliance level | Strict ERC-8004 / Core + TNS / Simplified MVP |
| 3 | Identity Registry rewrite | Yes (match standard) / No (keep scaffold) |
| 4 | Reputation read functions | Full implementation / Basic only |
| 5 | TNS architecture | Separate contract / Integrated |
| 6 | Upgradability | Immutable / UUPS Proxy |
| 7 | Validation Registry | V1 / Defer to V2 |
