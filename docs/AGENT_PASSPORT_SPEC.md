# Appendix B — Agent Passport JSON Schema (Tempo + ERC-8004)
*Schema Version: 1.1.0 — Updated 2026-02-24*

## B.1 Назначение
Agent Passport — это off-chain документ (JSON), размещаемый в IPFS и указываемый в TNS `metadataURI`. Он является **каноническим описанием идентичности агента**, его возможностей (capabilities) и доказательств доверия (proofs).

Паспорт совместим с **ERC-8004** и расширен для экосистемы Tempo: поддержка XMTP-транспорта, машиночитаемых capabilities (навыки + accepted_payload схемы), иерархии `owner ↔ agent`.

---

## B.2 Нормативные требования
1. `schemaVersion` **MUST** быть задан (`"1.1.0"`).
2. `id.tns` **MUST** соответствовать домену в TNS.
3. `ownership.ownerAddress` **MUST** присутствовать — адрес человека/DAO, владеющего агентом.
4. `ownership.agentAddress` **MUST** присутствовать — рабочий адрес агента.
5. `services` **MUST** присутствовать (для совместимости с ERC-8004).
6. `capabilities.skills` **SHOULD** присутствовать для machine-readable discovery.
7. `integrity.signature` **SHOULD** присутствовать (подпись ownerAddress).

---

## B.3 JSON Schema (v1.1, Hybrid)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tempo.network/schemas/agent-passport.schema.json",
  "title": "Tempo Agent Passport (ERC-8004 Compatible)",
  "type": "object",
  "required": ["schemaVersion", "issuedAt", "id", "ownership", "agent", "services"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^1\\.\\d+\\.\\d+$" },
    "type": { "const": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" },
    "issuedAt": { "type": "string", "format": "date-time" },

    "id": {
      "type": "object",
      "required": ["tns"],
      "properties": {
        "tns": { "type": "string", "example": "btc-analyzer.tempo" },
        "did": { "type": "string", "example": "did:tempo:btc-analyzer" }
      }
    },

    "ownership": {
      "type": "object",
      "required": ["ownerAddress", "agentAddress"],
      "description": "Иерархия owner↔agent. ownerAddress — человек/DAO, agentAddress — рабочий кошелёк агента.",
      "properties": {
        "ownerAddress": { "type": "string", "description": "EOA или SCW владельца (человек/DAO)" },
        "agentAddress": { "type": "string", "description": "EOA агента, подписывает транзакции регистрации" }
      }
    },

    "agent": {
      "type": "object",
      "required": ["type", "displayName"],
      "properties": {
        "type": { "type": "string", "enum": ["INDIVIDUAL", "ORG", "DAO", "BOT"] },
        "displayName": { "type": "string" },
        "description": { "type": "string" },
        "image": { "type": "string" }
      }
    },

    "services": {
      "type": "array",
      "description": "ERC-8004 Standard Service List. Supported names: MCP, XMTP, Payment, GitHub, REST.",
      "items": {
        "type": "object",
        "required": ["name", "endpoint"],
        "properties": {
          "name": { "type": "string" },
          "endpoint": {
            "type": "string",
            "description": "For XMTP: 'xmtp:<ETH_ADDRESS>'. For MCP: 'wss://...' or 'https://...'. For Payment: '0x...'."
          },
          "version": { "type": "string" },
          "metadata": { "type": "object", "description": "Transport-specific extras, e.g. xmtp.inboxId" }
        }
      }
    },

    "capabilities": {
      "type": "object",
      "description": "Machine-readable agent capabilities. Self-attested. Validated post-facto via Reputation Registry.",
      "properties": {
        "protocols": {
          "type": "array",
          "description": "Supported communication protocols",
          "items": { "type": "string" },
          "example": ["mcp/1.0", "xmtp/v3-mls", "a2a/json-rpc"]
        },
        "skills": {
          "type": "array",
          "description": "List of skills the agent can perform, each with an accepted_payload JSON Schema",
          "items": {
            "type": "object",
            "required": ["id", "name", "accepted_payload"],
            "properties": {
              "id": { "type": "string", "description": "Unique skill identifier, e.g. 'btc_analysis'" },
              "name": { "type": "string" },
              "description": { "type": "string" },
              "accepted_payload": {
                "type": "object",
                "description": "JSON Schema describing the expected input payload for this skill"
              },
              "response_schema": {
                "type": "object",
                "description": "JSON Schema describing the output. Optional but recommended."
              }
            }
          }
        }
      }
    },

    "routing": {
      "type": "object",
      "description": "Tempo-specific shortcut routing (mirrors services for quick lookup)",
      "properties": {
        "mcpEndpoint": { "type": "string" },
        "xmtpAddress": { "type": "string" },
        "paymentWallet": { "type": "string" }
      }
    },

    "proofs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "value"],
        "properties": {
          "type": { "type": "string", "enum": ["GITHUB", "DOMAIN", "ONCHAIN", "KYC"] },
          "value": { "type": "string" },
          "evidence": { "type": "object" }
        }
      }
    },

    "integrity": {
      "type": "object",
      "description": "Self-contained tamper-evidence. Signed by ownerAddress.",
      "properties": {
        "hash": { "type": "string", "description": "keccak256 of JCS-canonicalized passport (without integrity field)" },
        "signature": {
          "type": "object",
          "properties": {
            "type": { "enum": ["EIP191", "EIP712"] },
            "value": { "type": "string" },
            "signer": { "type": "string", "description": "MUST match ownership.ownerAddress" }
          }
        }
      }
    }
  }
}
```

---

## B.4 Пример (BTC Analyzer Agent Passport)

Полный пример — см. `/agent-example.json` в корне репозитория.

---

## B.5 Canonicalization и Подпись
Для защиты от подмены JSON (даже если IPFS ссылка корректна):
1. Убрать поле `integrity`.
2. JCS Canonicalize (RFC 8785).
3. `keccak256` → `sign` (EIP-191 или EIP-712). Signer = `ownerAddress`.
4. Вставить `integrity` обратно.

---

## B.6 Changelog
| Version | Changes |
|---|---|
| 1.0.0 | Initial schema: id, agent, services, routing, proofs, integrity |
| 1.1.0 | Added: `ownership` (ownerAddress + agentAddress), `capabilities` (protocols + skills + accepted_payload), XMTP service type |
