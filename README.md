# Tempo Identity Registry (TNS)

This project implements **ERC-8004: Trustless Agents** for the Tempo Network.
While user-facing branding is **TNS (Tempo Name Service)**, architecturally it is a full-stack **Identity Registry**.

It provides an on-chain registry for AI Agents (and humans), enabling:
1.  **Identity:** NFT-based agent handles (e.g. `vpn.tempo`) resolving to rich metadata.
2.  **Reputation:** Standardized feedback mechanism for trust scores.
3.  **Discovery:** On-chain lookup for agent services (MCP endpoints, payment addresses).

## Components

- **TempoIdentityRegistry.sol:** Main contract. Extends ERC-721 + URIStorage.
- **Agent Registration File:** JSON schema compatible with ERC-8004 + TNS extensions.

## Status

🚧 **Work in Progress**. Initial scaffold.

## License

MIT
