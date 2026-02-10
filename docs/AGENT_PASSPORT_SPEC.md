# Appendix B — Agent Passport JSON Schema (Tempo + ERC-8004)

## B.1 Назначение
Agent Passport — это off-chain документ (JSON), размещаемый в IPFS и указываемый в TNS `metadataURI`. Он является **каноническим описанием идентичности агента**, его возможностей (capabilities) и доказательств доверия (proofs).

Паспорт спроектирован так, чтобы быть **совместимым с ERC-8004**, но предоставлять расширенные поля для экосистемы Tempo (MCP, Payments, Trust).

---

## B.2 Нормативные требования
1. `schemaVersion` **MUST** быть задан.
2. `id.tns` **MUST** соответствовать домену в TNS.
3. `services` **MUST** присутствовать (для совместимости с ERC-8004).
4. `integrity.signature` **SHOULD** присутствовать (подпись владельца).

---

## B.3 JSON Schema (Hybrid)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tempo.network/schemas/agent-passport.schema.json",
  "title": "Tempo Agent Passport (ERC-8004 Compatible)",
  "type": "object",
  "required": ["schemaVersion", "issuedAt", "id", "agent", "services"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^1\\.\\d+\\.\\d+$" },
    "type": { "const": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" },
    "issuedAt": { "type": "string", "format": "date-time" },
    
    "id": {
      "type": "object",
      "required": ["tns"],
      "properties": {
        "tns": { "type": "string", "description": "shop.tempo" },
        "did": { "type": "string" }
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
      "description": "ERC-8004 Standard Service List",
      "items": {
        "type": "object",
        "required": ["name", "endpoint"],
        "properties": {
          "name": { "type": "string" },
          "endpoint": { "type": "string" },
          "version": { "type": "string" }
        }
      }
    },

    "routing": {
      "type": "object",
      "description": "Tempo-specific structured routing (maps to services)",
      "properties": {
        "mcpEndpoint": { "type": "string" },
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
      "properties": {
        "hash": { "type": "string" },
        "signature": {
          "type": "object",
          "properties": {
            "type": { "enum": ["EIP191", "EIP712"] },
            "value": { "type": "string" },
            "signer": { "type": "string" }
          }
        }
      }
    }
  }
}
```

---

## B.4 Пример (Valid Passport)

```json
{
  "schemaVersion": "1.0.0",
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "issuedAt": "2026-02-10T08:30:00Z",
  "id": {
    "tns": "shop.tempo"
  },
  "agent": {
    "type": "ORG",
    "displayName": "Tempo Shop Agent",
    "description": "Official store agent.",
    "image": "ipfs://QmLogo"
  },
  "services": [
    {
      "name": "MCP",
      "endpoint": "wss://shop.tempo/mcp",
      "version": "1.0"
    },
    {
      "name": "Payment",
      "endpoint": "0x1234567890123456789012345678901234567890",
      "version": "EVM"
    }
  ],
  "routing": {
    "mcpEndpoint": "wss://shop.tempo/mcp",
    "paymentWallet": "0x1234567890123456789012345678901234567890"
  },
  "proofs": [
    {
      "type": "GITHUB",
      "value": "slowtenzor/tempo-identity"
    }
  ]
}
```

---

## B.5 Canonicalization и Подпись
Для защиты от подмены JSON (даже если IPFS ссылка корректна, важно доказать авторство содержимого):
1. Убрать поле `integrity`.
2. JCS Canonicalize.
3. Hash & Sign (EIP-191/712).
4. Вставить `integrity` обратно.
