# Tempo Identity Registry (ERC-8004)

This project implements **ERC-8004: Trustless Agents** for the Tempo Network (TNS).

It provides an on-chain registry for AI Agents, enabling:
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
