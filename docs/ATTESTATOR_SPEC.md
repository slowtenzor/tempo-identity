# ATTESTATOR_SPEC.md — Attestator Entity (V2 Foundation)

*Status: Architectural Spec — deferred to V2*  
*Related: TempoReputationRegistry.sol, AGENT_PASSPORT_SPEC.md*

---

## 1. Назначение

Attestator — отдельная сущность (смарт-контракт + off-chain сервис), которая **верифицирует заявленные capabilities пост-фактум** и выдаёт on-chain аттестации.

Ключевой принцип: агенты **самоатестуют** skills в IPFS Passport (мы доверяем декларации). Attestator оценивает реальное качество на основе истории выполненных задач.

---

## 2. Архитектура

```
[Agent Passport] ──── self-attested skills ────▶ IPFS (trusted by default)
                                                         │
                                              [Attestator Off-Chain]
                                                         │ analyzes
                                              ◀──────────┘
                                   [TempoReputationRegistry]
                                            │ feedback history
                                            │ response rate
                                            │ dispute outcomes
                                            ▼
                                  [TempoAttestationRegistry]  ← NEW (V2)
                                   issues VerifiedSkill badges
                                            │
                                            ▼
                                  Agent Passport ← updated CID with attestations[]
```

---

## 3. Attestation Types

| Type | Mechanism | Trust Level |
|---|---|---|
| `REPUTATION_BASED` | Хорошая история в ReputationRegistry | ⭐⭐ |
| `ZK_PROOF` | Агент предоставляет ZK-доказательство результата | ⭐⭐⭐⭐ |
| `TEE_SIGNED` | Агент работает в TEE (Phala/Oasis), результат подписан attestation report | ⭐⭐⭐⭐⭐ |
| `HUMAN_REVIEW` | DAO/комитет одобрил декларацию | ⭐⭐⭐ |

---

## 4. Контракт `TempoAttestationRegistry.sol` (V2)

```solidity
interface ITempoAttestationRegistry {
    struct Attestation {
        uint256 agentId;
        string skillId;           // matches capability.skills[i].id in passport
        AttestationType attType;
        uint8 level;              // 1-5
        address attestedBy;       // attestator address
        uint256 issuedAt;
        uint256 expiresAt;        // 0 = no expiry
        bytes evidence;           // IPFS CID or ZK proof hash
    }

    enum AttestationType { REPUTATION_BASED, ZK_PROOF, TEE_SIGNED, HUMAN_REVIEW }

    event SkillAttested(
        uint256 indexed agentId,
        string skillId,
        AttestationType attType,
        uint8 level,
        address indexed attestedBy
    );

    function attest(uint256 agentId, string calldata skillId, AttestationType attType, uint8 level, bytes calldata evidence) external;
    function getAttestations(uint256 agentId) external view returns (Attestation[] memory);
    function hasAttestation(uint256 agentId, string calldata skillId) external view returns (bool, uint8 level);
}
```

---

## 5. Off-Chain Attestator Service

**Trigger:** `NewFeedback` event от `TempoReputationRegistry`

**Logic (Reputation-based):**
```
1. Fetch агент из TempoIdentityRegistry → tokenURI → IPFS Passport
2. Fetch feedback history from TempoReputationRegistry
3. For each declared skill:
   a. Find feedback entries related to that skill
   b. Calculate: success_rate, avg_score, response_time
   c. If score > threshold → call attest(agentId, skillId, REPUTATION_BASED, level)
```

**Attestator Address:** multi-sig DAO wallet или verified TEE operator

---

## 6. Passport Integration (V2 Extension)

После аттестации агент может обновить свой IPFS Passport добавив:
```json
{
  "attestations": [
    {
      "skillId": "btc_market_analysis",
      "type": "REPUTATION_BASED",
      "level": 3,
      "attestedBy": "0xAttestatorAddress",
      "evidence": "ipfs://QmEvidenceCID",
      "issuedAt": "2026-03-01T00:00:00Z"
    }
  ]
}
```

---

## 7. Задел в текущей V1 архитектуре

Контракт `TempoIdentityRegistry.sol` уже:
- ✅ Хранит `agentId` — стабильный ключ для аттестаций
- ✅ Хранит `tokenURI` → IPFS Passport с `capabilities.skills[]`
- ✅ Связан с `TempoReputationRegistry` (feedback data)

Для V2 потребуется только:
1. Добавить `TempoAttestationRegistry.sol`
2. Инициализировать его с адресом `TempoIdentityRegistry`
3. Запустить off-chain Attestator сервис

---

## 8. Open Questions (V2)

- Кто может быть Attestator? (permissioned set vs. open / staked validators)
- Как избежать Sybil аттестаций?
- Интеграция с Phala Network / Oasis ROFL для TEE attestation?
- Экономика: платят ли агенты за аттестацию?
