# Tempo Identity Registry (TNS) — Technical Specification V1

## 1. Overview
We are building **Tempo Name Service (TNS)**, which serves as the **Identity Layer** for the Tempo Network.
Crucially, it implements the **ERC-8004 (Trustless Agents)** standard, enabling:
- **Identity:** NFT-based agent handles (`*.tempo`) resolving to off-chain profiles.
- **Reputation:** On-chain feedback registry for Trust Scores.
- **Discovery:** Service endpoint registry (MCP, Payments).

## 2. Architecture

### 2.1. Contracts (Solidity 0.8.20+)
The repository contains two core contracts (already scaffolded):

1.  **`TempoIdentityRegistry.sol`** (ERC-721 + URIStorage):
    -   **Role:** Mints unique agent handles (`vpn.tempo`) as NFTs.
    -   **Storage:** Maps `name -> tokenId` and `tokenId -> metadataURI`.
    -   **Standard:** Implements ERC-8004 `register`, `setAgentURI`, `getAgentWallet`.

2.  **`TempoReputationRegistry.sol`**:
    -   **Role:** Stores feedback signals from clients.
    -   **Standard:** Implements ERC-8004 `giveFeedback`.
    -   **Events:** Emits `NewFeedback` for indexers (like 8004scan).

### 2.2. Data Schema (Off-chain)
Agent metadata ("Passport") is stored off-chain (IPFS) and referenced by `tokenURI`.
-   **Schema:** See `docs/AGENT_PASSPORT_SPEC.md`.
-   **Format:** JSON (ERC-8004 compatible + Tempo extensions).

## 3. Implementation Tasks (Coding Agent)

Your goal is to turn the scaffold into a production-ready deployment.

### Phase 1: Hardhat Setup & Tests
1.  **Initialize Hardhat:**
    -   Install dependencies (`hardhat`, `ethers`, `@openzeppelin/contracts`).
    -   Configure `hardhat.config.ts` for Tempo Testnet (ChainId: 5042002).
2.  **Write Tests (`test/Identity.test.ts`):**
    -   Test registration of a new name.
    -   Test duplicate name prevention.
    -   Test metadata update (`setAgentURI`).
    -   Test wallet update (`setAgentWallet`).
3.  **Write Tests (`test/Reputation.test.ts`):**
    -   Test giving feedback.
    -   Test verifying event emission (crucial for indexers).

### Phase 2: Deployment Scripts
1.  Create `scripts/deploy.ts`:
    -   Deploy `TempoIdentityRegistry`.
    -   Deploy `TempoReputationRegistry` (pass Identity address to constructor).
    -   **Verify** contracts on block explorer (if API available) or print constructor args.
    -   Save deployed addresses to `deployments.json`.

### Phase 3: CLI Tooling (Optional but Recommended)
Create a helper script `scripts/manage-identity.ts` to:
-   **Mint:** `npx hardhat run scripts/mint.ts --name "my-agent" --uri "ipfs://..."`
-   **Update:** `npx hardhat run scripts/update-uri.ts --id 1 --uri "ipfs://..."`

## 4. Key Constraints
-   **Solidity Version:** `^0.8.20`.
-   **Framework:** Hardhat + Ethers v6.
-   **Network:** Tempo Testnet (RPC: `https://rpc.testnet.tempo.network` [placeholder - verify actual RPC]).
-   **Standard Compliance:** Do NOT change public function signatures defined in ERC-8004 specs (to maintain compatibility with indexers).

## 5. References
-   **ERC-8004 Spec:** [EIP-8004 Draft](https://eips.ethereum.org/EIPS/eip-8004)
-   **Passport Schema:** `docs/AGENT_PASSPORT_SPEC.md`
-   **Current Repo:** `slowtenzor/tempo-identity`
