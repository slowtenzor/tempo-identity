# UI Feature Requests — Implementation Report

**Date**: 2026-02-12
**Deployment version**: draft_v2
**Network**: tempoModerato (chainId: 42431)
**Deployer**: `0x4c155324A7Fc115640F0087a91CeF69C5e8A1C39`

---

## Contract Addresses (draft_v2)

| Contract | Address |
|---|---|
| TempoIdentityRegistry | `0x563D7b2FACd1cB19Fc7e4Fd6C26e0Bf69360BE4A` |
| TempoReputationRegistry | `0x21473cd6d832a3d6BC933a2f59DAE7311276132C` |
| TempoNameService | `0x87020198e7595C60b200EA80be41548F44573365` |

### Previous addresses (draft_v1, archived in `deployments.json` → `history`)

| Contract | Address |
|---|---|
| TempoIdentityRegistry | `0xF4942bdF12767617c0ecf66613d93b6B9C8E4FCE` |
| TempoReputationRegistry | `0x61eC6177C7F7efd732A9De59f75C35466659e0f3` |
| TempoNameService | `0xb3e2B82836175659977676B7Fd3f246678c33Ef1` |

---

## Changes Implemented

### FR-001: Dashboard owner agent list from chain

**Status**: ✅ Implemented (contract + UI hook)

**Contract changes** (`TempoIdentityRegistry.sol`):
- Added `mapping(address => uint256[]) _ownedTokens` — tracks agent IDs per owner.
- Added `mapping(uint256 => uint256) _ownedTokensIndex` — index for swap-and-pop removal.
- Added `getAgentsByOwner(address owner) → uint256[]` — returns full list of owned agent IDs in a single call.
- Updated `_update()` override — manages enumeration on mint, transfer, and burn using swap-and-pop for gas efficiency.

**UI changes** (`hooks/use-identity-registry.ts`):
- `useAgentsByOwner` hook rewritten: now calls `getAgentsByOwner` directly instead of `balanceOf`.
- Returns `agentIds: number[]`, `balance: number`, `isLoading: boolean`, `refetch()`.
- Removed comment about missing `tokenOfOwnerByIndex` — no longer needed.

**ABI changes** (`lib/contracts.ts`):
- Replaced `tokenOfOwnerByIndex` entry with `getAgentsByOwner` (returns `uint256[]`).

**Test coverage**:
- `should track agents by owner after registration` — registers 3 agents across 2 owners, verifies lists.
- `should update enumeration on transfer` — transfers agent, verifies both owners' lists update.
- `should return empty array for address with no agents`.
- `should remove from enumeration on burn` — burns middle agent, verifies swap-and-pop correctness.

---

### FR-006: Payment wallet audit trail

**Status**: ✅ Implemented (contract event enrichment)

**Contract changes** (`TempoIdentityRegistry.sol`):
- `AgentWalletSet` event signature changed:
  - **Before**: `AgentWalletSet(uint256 indexed agentId, address wallet)`
  - **After**: `AgentWalletSet(uint256 indexed agentId, address oldWallet, address newWallet)`
- `setAgentWallet()` now reads `oldWallet` from storage before overwriting and passes it to the event.
- On registration (mint), `oldWallet` is `address(0)` (first assignment).

**ABI changes** (`lib/contracts.ts`):
- Added `AgentWalletSet` event with `oldWallet` and `newWallet` fields.
- Added `setAgentWallet` function ABI (was missing in draft_v1).

**Test coverage**:
- `should emit AgentWalletSet with old and new wallet` — verifies `(agentId, user1, user2)` args.

---

### FR-007: Contract-level agent destroy/release

**Status**: ✅ Implemented (burn)

**Contract changes** (`TempoIdentityRegistry.sol`):
- Added `burn(uint256 agentId)` — owner-only, permanently destroys agent NFT.
  - Clears `_agentWallets[agentId]` and emits `AgentWalletUnset`.
  - Calls `_burn(agentId)` which triggers `_update` (handles enumeration cleanup).
  - Emits `AgentBurned(agentId, owner)`.
- Added `AgentBurned(uint256 indexed agentId, address indexed owner)` event.
- Note: TNS name must be released separately via `TempoNameService.releaseName()` **before** burn.

**UI changes** (`hooks/use-identity-registry.ts`):
- Added `useBurnAgent()` hook — calls `burn(agentId)`, tracks `isPending`, `isConfirming`, `isSuccess`.

**ABI changes** (`lib/contracts.ts`):
- Added `burn` function entry.
- Added `AgentBurned` event entry.

**Test coverage**:
- `should burn an agent by owner` — verifies `ownerOf` reverts after burn.
- `should emit AgentBurned event` — checks `(agentId=1, owner=user1)`.
- `should clear agent wallet on burn` — verifies `AgentWalletUnset` event.
- `should reject burn from non-owner` — verifies revert.
- `should remove from owner enumeration on burn` — verifies list is empty after burn.

---

### FR-012: Metadata mutation events for deterministic UI sync

**Status**: ✅ Partially implemented (URI event enrichment)

**Contract changes** (`TempoIdentityRegistry.sol`):
- `URIUpdated` event signature changed:
  - **Before**: `URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)`
  - **After**: `URIUpdated(uint256 indexed agentId, string oldURI, string newURI, address indexed updatedBy)`
- `setAgentURI()` now reads `tokenURI(agentId)` before overwriting and includes `oldURI` in the event.

**ABI changes** (`lib/contracts.ts`):
- Added `URIUpdated` event with `oldURI` and `newURI` fields.

**Test coverage**:
- `should emit URIUpdated event with old and new URI` — verifies `(1, "ipfs://original", "ipfs://updated", user1)`.

**Remaining for FR-012**:
- `AgentMetadataUpdated` event (not yet added — `MetadataSet` already covers this).
- `AgentWalletUpdated` — covered by enriched `AgentWalletSet` event (FR-006).

---

## Changes NOT Requiring Contract Modifications

These FRs are addressed at the UI/indexer level and did not require contract changes in draft_v2:

| FR | Description | Status |
|---|---|---|
| FR-002 | Feature request process | ✅ Active (this file) |
| FR-003 | Dashboard optimistic updates | 🔲 Open (UI-only, no contract needed) |
| FR-004 | Persist profile edits (IPFS + setAgentURI) | 🔲 Open (UI-only, `setAgentURI` already exists) |
| FR-008 | Replace Trust Score with Signals model | 🔲 Open (UI/indexer, no contract needed for v1) |
| FR-011 | Read-optimized reputation query surface | 🔲 Open (indexer/subgraph) |
| FR-013 | Volume normalization for multi-token receipts | 🔲 Open (indexer) |

---

## Deferred to v1.1

These FRs require additional contract development and are deferred:

| FR | Description | Reason |
|---|---|---|
| FR-005 | Secure wallet update flow (full UX) | `setAgentWallet` with EIP-712 signature already exists; UI confirmation flow pending |
| FR-009 | Receipt-gated feedback (submitFeedback) | Requires receipt contract integration; new storage + method |
| FR-010 | Standardized tip signals (tipAgent) | Requires new method + event |

---

## Deploy Infrastructure Changes

- `scripts/deploy.ts` now saves versioned deployments with `version` field.
- Previous deployment is archived in `deployments.json → history[]`.
- Deploy output annotated as `(draft_v2)`.

---

## Test Summary

```
65 passing (1s)

  TempoIdentityRegistry: 29 passing
    Registration:          6
    Agent URI:             3
    On-chain Metadata:     4
    Agent Wallet:          7
    FR-001 Enumeration:    4
    FR-007 Burn/Release:   5

  TempoNameService:       13 passing
  TempoReputationRegistry: 23 passing
```

---

## Files Modified

### Contract layer (`tempo-identity/`)
- `contracts/TempoIdentityRegistry.sol` — FR-001, FR-006, FR-007, FR-012
- `test/TempoIdentityRegistry.test.ts` — updated event signatures, added FR-001 + FR-007 tests
- `scripts/deploy.ts` — versioned deployment with history
- `deployments.json` — new addresses + history

### UI layer (`tempo-tns-registry-ui/`)
- `lib/contracts.ts` — new addresses, updated ABI (getAgentsByOwner, burn, setAgentWallet, new events)
- `hooks/use-identity-registry.ts` — rewritten `useAgentsByOwner`, added `useBurnAgent`
