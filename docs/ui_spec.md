# Technical Specification: Tempo TNS Registry UI

## 1. Project Overview

Web interface for the **Tempo Name Service (TNS)** — an on-chain identity registry for AI Agents.
The UI serves two purposes:

1. **Explorer (Public):** Search agents by `.tempo` name, view agent profiles, check reputation and MCP endpoint status.
2. **Management (Private):** Register new `.tempo` names, manage agent profiles (metadata, endpoints).

**Reference Style:** Similar to [8004scan.io](https://8004scan.io) — a technical service registry dashboard, **not** an NFT marketplace.

---

## 2. Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **State/Caching:** TanStack Query (React Query)
- **Wallet:** wagmi + viem (chain config will be provided separately)

> [!NOTE]
> All blockchain integration hooks (contract calls, event queries) will be added later.
> For now, build with **mock data** that matches the structures described below.
> Create a `useMockData` hook so the UI can be developed independently of the contracts.

---

## 3. Data Structures (For Mock Data)

### Agent Identity
```ts
interface Agent {
  agentId: number;            // On-chain NFT token ID
  name: string;               // TNS name, e.g. "vpn"
  fullName: string;           // "vpn.tempo"
  owner: string;              // Wallet address (0x...)
  agentWallet: string;        // Designated agent wallet (may differ from owner)
  agentType: "BOT" | "ORG" | "INDIVIDUAL" | "DAO";
  category: string;           // e.g. "Network Utility", "Marketplace", "Consulting"
  tokenURI: string;           // IPFS URI to passport JSON
}
```

### Agent Passport (fetched from IPFS via tokenURI)
```ts
interface AgentPassport {
  schemaVersion: string;
  issuedAt: string;           // ISO timestamp
  id: { tns: string };        // e.g. "vpn.tempo"
  agent: {
    type: string;
    displayName: string;
    description: string;
    image?: string;            // IPFS URI to avatar
  };
  services: Array<{
    name: string;              // "MCP", "Payment", "Web", "GitHub"
    endpoint: string;
    version?: string;
  }>;
  routing?: {
    mcpEndpoint?: string;
    paymentWallet?: string;
  };
  proofs?: Array<{
    type: "GITHUB" | "DOMAIN" | "ONCHAIN" | "KYC";
    value: string;
  }>;
}
```

### Reputation Feedback
```ts
interface FeedbackEntry {
  clientAddress: string;
  feedbackIndex: number;
  value: number;               // -128..127 (int128 on-chain, displayed as score)
  tag1: string;                // e.g. "quality", "accuracy", "speed"
  tag2: string;                // secondary tag
  isRevoked: boolean;
  // Response data (from events, not stored directly)
  responses?: Array<{
    responder: string;
    responseURI: string;
  }>;
}
```

---

## 4. Pages & Layout

### A. Home Page (`/`)

**Purpose:** Entry point — search, stats, recently registered agents.

#### Layout Blocks:

1. **Hero Section**
   - Large search bar: `[ Search by .tempo name or agent ID ]`
   - Search auto-appends `.tempo` if user types bare name (e.g. `vpn` → `vpn.tempo`)
   - On submit → navigate to `/agent/[name]`

2. **Network Stats Row** (3-4 metric cards)
   - Total Agents Registered
   - Total Names Resolved (TNS)
   - Total Feedback Signals
   - Active MCP Agents (with live endpoint)

3. **Recently Registered** (grid of 6 cards)
   - Each card shows: agent name, type badge (BOT/ORG/INDIVIDUAL/DAO), category, short description
   - Clicking a card → `/agent/[name]`

4. **Agent Type Filter** (optional for MVP)
   - Tabs or pills: All | BOT | ORG | INDIVIDUAL | DAO

---

### B. Agent Profile (`/agent/[name]`)

**Purpose:** Full agent detail page. The core page of the app.

#### Layout Blocks:

1. **Header Region** (two columns)
   - **Left:** Agent avatar (from passport `agent.image`, fallback to generated identicon/gradient)
   - **Right:**
     - **Name:** `vpn.tempo` + agent ID badge (`#1`)
     - **Type Badge:** BOT / ORG / INDIVIDUAL / DAO (color-coded)
     - **Category:** "Network Utility"
     - **Owner:** truncated address with copy button
     - **Agent Wallet:** truncated address (if different from owner, show separately)
     - **Live Status:** Pulsing green/red dot — client-side `fetch(mcpEndpoint)` to check if MCP endpoint responds

2. **Trust & Badges Row**
   - **Trust Score:** Visual gauge or progress bar (0–100), computed from reputation data
   - **Badges:** (shown as small pills)
     - "MCP Ready" — if services contain an MCP endpoint
     - "Verified" — if proofs array has entries
     - "Has Payment" — if services contain a Payment endpoint

3. **Content Tabs:**

   **Tab: Overview**
   - Description text (from passport `agent.description`)
   - Services list — rendered as cards or rows:
     - Icon per service type (MCP, Payment, Web, GitHub)
     - Endpoint (clickable link for http/wss, address display for wallets)
     - Version badge if present
   - Proofs section — list verified proofs (GitHub, Domain, KYC) with links/evidence

   **Tab: Capabilities**
   - Render MCP endpoint capabilities (if available from passport `services`)
   - Show as code-block or structured list of tool names
   - Goal: show developers what tools this agent exposes via MCP

   **Tab: Reputation**
   - **Summary bar:** Average score, total feedbacks count, unique clients count
   - **Feedback table:**
     - Columns: Client (address), Score, Tag 1, Tag 2, Status (active/revoked)
     - Each row expandable to show response thread
   - **Filters:** by tag1, by status (active only / include revoked)

   **Tab: Raw Data**
   - On-chain metadata key-value table
   - Raw IPFS passport JSON (collapsible)
   - Links: Explorer TX, IPFS gateway link

---

### C. Registration Flow (`/register`)

**Purpose:** Register a new `.tempo` name for an agent.

#### Layout Blocks:

1. **Name Input**
   - Text field with `.tempo` suffix shown inline
   - Real-time availability check (debounced, shows ✓ Available / ✗ Taken)
   - If taken → link to existing agent profile
   - Validation: 1–64 characters, alphanumeric + hyphens

2. **Agent Type Selector**
   - Radio or card select: BOT / ORG / INDIVIDUAL / DAO
   - Each card shows icon + short description

3. **Profile Form** (collapsible "Advanced" section)
   - Display Name (text)
   - Description (textarea)
   - Category (dropdown or text)
   - Avatar (image upload → IPFS, optional)
   - MCP Endpoint (URL input)
   - Payment Wallet (address input)
   - GitHub URL (text, optional)

4. **Action Button**
   - "Register `[name].tempo`" — requires wallet connection
   - Shows estimated gas cost
   - On success → redirect to `/agent/[name]` profile page

---

### D. User Dashboard (`/dashboard`)

**Purpose:** Manage agents owned by the connected wallet. Requires wallet connection.

#### Layout Blocks:

1. **Wallet Header**
   - Connected address, network indicator
   - Total agents owned count

2. **My Agents Grid**
   - Cards for each owned agent: name, type, last updated
   - Quick actions: Edit, View Profile

3. **Edit Agent Panel** (drawer or modal)
   - Update MCP Endpoint
   - Update Profile Data (form → generate JSON → placeholder for IPFS upload → update tokenURI)
   - Update Agent Wallet (shows current wallet, input new + signature requirement note)
   - Release TNS Name (danger zone, confirmation dialog)

---

## 5. UI/UX Notes

1. **Dark theme primary.** Light mode optional.
2. **Search is king.** The search bar should be prominent and fast. Support searching by: `.tempo` name, agent ID number, owner address.
3. **Graceful fallbacks.** If IPFS passport is not set or unavailable, show "No profile data" placeholder — never break the page.
4. **Address display.** Always truncate addresses (`0x4c15...1C39`) with copy-to-clipboard button.
5. **Status indicators.** Use pulsing dots for live MCP status, color-coded badges for agent types.
6. **Mobile responsive.** All pages should work on mobile with collapsible navigation.
7. **Loading states.** Skeleton loaders for all data-dependent blocks.

---

## 6. Mock Data for Development

Create at least 3 mock agents for development:

| Name | Type | Category | MCP | Description |
|------|------|----------|-----|-------------|
| vpn.tempo | BOT | Network Utility | `wss://vpn.tempo.xyz/mcp` | Premium VPN Agent |
| shop.tempo | ORG | Marketplace | `wss://shop.tempo.xyz/mcp` | Digital goods marketplace |
| alice.tempo | INDIVIDUAL | Consulting | `wss://alice.tempo.xyz/mcp` | AI researcher |

These match the actual agents deployed on Tempo Moderato testnet.