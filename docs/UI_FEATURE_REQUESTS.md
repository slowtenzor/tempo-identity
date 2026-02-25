# UI Feature Requests Log

Last updated: 2026-02-11

## FR-001: Dashboard owner agent list from chain
- Source: Product discussion during UI integration.
- Problem: Dashboard should show agents owned by connected wallet, but current contract does not expose owner -> tokenIds enumeration.
- Current limitation:
  - `balanceOf(owner)` returns count only.
  - `tokenOfOwnerByIndex` is not available (contract is not ERC721Enumerable).
- Required behavior:
  - Dashboard reliably resolves and displays owner agents from chain data.
- Suggested implementation path:
  1. Short term: build list from events (`Registered` + `Transfer`) and verify with `ownerOf`.
  2. Mid term: add dedicated indexer (The Graph / backend index service) for robust owner lookup.
  3. Long term: if contract upgrade is possible, expose enumerable or explicit owner index methods.
- Priority: High
- Status: Open

## FR-002: Feature request process
- Source: User request to keep tracking this and subsequent requests in docs.
- Requirement:
  - All new feature requests from UI workstream should be appended to this file.
  - Entries should include: ID, problem, required behavior, implementation options, priority, status.
- Priority: Medium
- Status: Active process

## FR-003: Dashboard point updates after agent edit
- Source: UX feedback from dashboard editing flow.
- Problem: After editing status (active/inactive), UI reflects changes only after full page reload.
- Required behavior:
  - Apply update instantly for the edited agent only.
  - Avoid full dataset reload when many agents exist.
- Proposed mechanics:
  1. Optimistic/targeted cache patch for `owned-agents` query by `agentId`.
  2. Background refetch for consistency after tx confirmation.
  3. Keep list filtering (`active only` / `show inactive`) reactive to patched status.
- Priority: High
- Status: In progress

## FR-004: Persist profile edits (display name/description/etc.)
- Source: Product feedback on non-persistent edit fields.
- Problem: Editing display name/description in dashboard currently does not persist on-chain/off-chain.
- Required behavior:
  - Save profile edits as a new passport version in IPFS.
  - Update NFT metadata pointer via contract (`setAgentURI`).
- Proposed mechanics:
  1. Read current `tokenURI` passport JSON.
  2. Merge edited fields into a new passport object and bump schema/version marker.
  3. Upload new JSON to IPFS and get new `ipfs://CID`.
  4. Call `setAgentURI(agentId, newIpfsUri)`.
  5. Refresh profile/dashboard from new URI.
- Priority: High
- Status: In progress (partial shipped)

## FR-005: Secure payment/agent wallet update flow
- Source: Product feedback on payment address updates.
- Problem: Wallet changes are security-sensitive and require explicit secure UX/verification.
- Required behavior:
  - Support secure agent wallet updates using contract-native signature flow.
  - Separate payment routing metadata edits from agent wallet ownership changes.
- Proposed mechanics:
  1. Agent wallet change:
     - Call `setAgentWallet(agentId, newWallet, deadline, signature)`.
     - Signature must be produced by the **new wallet** (EIP-712 typed data).
  2. Payment wallet change (routing metadata in passport):
     - Produce new passport in IPFS and update via `setAgentURI`.
  3. UX controls:
     - Dedicated confirmation step, signer identity preview, and explicit risk notice.
- Priority: High
- Status: Open

## FR-006: Payment wallet audit trail and anti-fraud protections
- Source: Security requirement from product discussion.
- Problem: Payment wallet changes can be abused for social engineering/scam if there is no immutable history and risk signaling.
- Required behavior:
  - Record complete payment wallet change history.
  - Expose history to clients in UI/API.
  - Add safeguards for recently changed wallets.
- Proposed mechanics:
  1. Emit immutable on-chain event on each payment wallet update:
     - `agentId`, `oldWallet`, `newWallet`, `updatedBy`, `timestamp` (or block reference).
  2. Keep versioned passport history with links to previous CID + tx hash.
  3. Add cooldown window after wallet change (e.g., 24-72h) with warning status.
  4. Require cryptographic proof from new wallet (EIP-712 signature) for update validity.
  5. UI and resolver policy:
     - Display "recently changed wallet" warning.
     - Provide "current" + "previous" wallets timeline.
     - Default trust policy for clients: avoid auto-paying to wallets changed within cooldown.
- Priority: Critical
- Status: Open

## FR-007: Contract-level agent destroy/release flow
- Source: UX feedback on inactive Danger Zone button in dashboard editor.
- Problem: UI exposes a "Release" action, but current implementation has no contract-backed behavior and can mislead users.
- Required behavior:
  - Provide explicit contract-level mechanism to retire/release an agent identity.
  - Ensure irreversible actions are auditable and safe.
- Proposed mechanics:
  1. Contract option A: `burn(agentId)` for owner/authorized role with clear event emission.
  2. Contract option B: soft-delete flag (`status=retired`) with resolver policy that excludes retired agents by default.
  3. Mandatory events:
     - `AgentReleased(agentId, owner, previousName, timestamp)`.
  4. Name service policy decision:
     - whether released `.tempo` name becomes re-registrable immediately or after cooldown/quarantine.
  5. UI requirements:
     - Replace placeholder button with real tx flow only when ABI supports it.
     - Add typed confirmation (`release <name>`) + explicit irreversible warning.
- Priority: High
- Status: Open

## FR-008: Replace Trust Score with Reputation Signals model (v1)
- Source: `score_spec_v1.md` and product direction update.
- Problem: Current UI uses synthetic score placeholders (`Trust Score 50/100`, `Average Score`) that are not transparent and not grounded in verifiable flow.
- Required behavior:
  - Replace score-centric UI with signals-centric UI.
  - Primary blocks: `Activity` + `Feedback` based on on-chain/indexed facts.
- Required data for UI:
  1. `totalReceipts`
  2. `uniqueClients`
  3. `totalVolume`
  4. `totalTips`
  5. `totalFeedbacks`
  6. `averageRating` (if rating exists)
  7. `% staked feedback` (only if stake model is implemented)
- Contract/indexer notes:
  - Metrics may be computed in indexer; no single on-chain aggregate score required.
  - If score is kept, it must be computed off-chain (indexer), not stored as authoritative on-chain value.
- Priority: High
- Status: Open

## FR-009: Receipt-gated feedback integrity (one feedback per receipt)
- Source: `score_spec_v1.md` feedback model.
- Problem: Without receipt-gating, feedback can be sybil/low-integrity and unrelated to real paid interactions.
- Required behavior:
  - Feedback submission must be allowed only for valid receipt linked to this agent and caller.
  - One receipt can be used for feedback once.
- Required contract mechanics:
  1. Validation: `receipt.agentId == targetAgentId` and `receipt.buyer == msg.sender`.
  2. Anti-reuse: `receiptFeedbackUsed[receiptId]` guard.
  3. Method: `submitFeedback(receiptId, rating, tags, commentHash)`.
  4. Event: `FeedbackSubmitted(agentId, reviewer, receiptId, rating, tagsHash, commentHash)`.
- UI/indexer dependency:
  - UI reads only; feedback is submitted from another app.
  - TNS UI must consume indexed `receiptId` linkage and `verifiedReceipt` status.
- Priority: Critical
- Status: Open

## FR-010: Standardized tip signals for reliable indexing
- Source: `score_spec_v1.md` tip model.
- Problem: Plain token transfers are hard to attribute to agent-level tipping in UI/indexer.
- Required behavior:
  - Provide explicit tip attribution to `agentId` for reputation signals.
- Required contract mechanics (preferred):
  1. Method: `tipAgent(agentId, amount)`.
  2. Event: `AgentTipped(agentId, from, amount)`.
- Alternative (if no new method):
  - Define canonical event source from payments module that uniquely maps tip -> `agentId`.
- Priority: High
- Status: Open

## FR-011: Read-optimized reputation query surface (contract view or indexer API)
- Source: UI requirement to render `Signals` tab fast and deterministically.
- Problem: Pulling raw logs per profile page is expensive and unstable at scale.
- Required behavior:
  - TNS UI must fetch all Signals-tab data with bounded query cost.
- Required implementation path:
  1. Preferred: dedicated indexer endpoint (or subgraph) exposing agent-level aggregates + paginated feedback table.
  2. Optional on-chain view helpers if available:
     - summary view for activity + feedback counters,
     - feedback pagination by `agentId`.
  3. Canonical schema for table row:
     - `client`, `rating`, `tags[]`, `stake`, `receiptId`, `verifiedReceipt`, `timestamp`.
- Priority: High
- Status: Open

## FR-012: Metadata mutation events for deterministic UI sync
- Source: MVP UX issues with stale dashboard/profile after updates.
- Problem: Without canonical events for metadata/profile mutations, UI/indexer must rely on polling and expensive refetch.
- Required behavior:
  - Any profile-affecting write should emit explicit event for cache/index invalidation.
- Required contract events:
  1. `AgentURIUpdated(agentId, oldURI, newURI, updatedBy)`
  2. `AgentMetadataUpdated(agentId, key, value, updatedBy)`
  3. `AgentWalletUpdated(agentId, oldWallet, newWallet, updatedBy)`
- Notes:
  - Even with indexer, these events drastically simplify reactive UI refresh.
- Priority: High
- Status: Open

## FR-013: Volume normalization for multi-token receipts in Signals
- Source: `score_spec_v1.md` Activity metrics (`Total Volume`) and cross-token reality.
- Problem: `Total Volume` is ambiguous if receipts can be paid in different tokens/decimals.
- Required behavior:
  - Signals data must include normalized numeric representation and raw token breakdown.
- Required data contract/indexer schema:
  1. Per receipt: `token`, `amountRaw`, `decimals`.
  2. Aggregates:
     - `totalVolumeByToken[]`
     - optional normalized `totalVolumeUsd` (if pricing/oracle policy exists).
  3. UI default:
     - show token-aware volume, avoid fake cross-token summation.
- Priority: Medium
- Status: Open

## Contract Backlog (deployment order)

### v1-core (MVP required)
1. FR-009: Receipt-gated feedback integrity (one feedback per receipt)
   - Why now: prevents fake/sybil feedback and ties reputation to real paid interactions.
2. FR-005 + FR-006: Secure wallet update flow + immutable wallet-change audit trail
   - Why now: closes high-risk fraud vectors around payment wallet changes.
3. FR-001 + FR-011: Read-optimized ownership/reputation data path (indexer/subgraph)
   - Why now: UI needs deterministic and cheap reads; raw log scanning does not scale.
4. FR-008: Reputation Signals model (replace synthetic Trust Score)
   - Why now: aligns UI with transparent on-chain/indexed signals model.
5. FR-012: Metadata/profile mutation events
   - Why now: enables reactive cache invalidation and consistent UI state after writes.

### v1.1 (next phase)
1. FR-010: Standardized tip attribution/events (`tipAgent` + `AgentTipped`)
2. FR-007: Contract-level destroy/release lifecycle (`burn` or soft-retire + resolver policy)
3. FR-013: Multi-token volume normalization (`token`, `amountRaw`, `decimals`, `totalVolumeByToken`)

### Suggested rollout
1. Deploy v1-core contracts + indexer schema.
2. Switch UI Signals tab to indexed aggregates and receipt-verified feedback rows.
3. Ship v1.1 lifecycle/tips/volume enhancements.
