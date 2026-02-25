# AA_SPEC.md — Account Abstraction Spec for Tempo TNS Registry UI

*Component: `tempo-tns-registry-ui` extension*  
*Standard: ERC-4337*  
*Status: Specification (no code — implementation is separate scope)*

---

## 1. Problem

Агент (BOT-type) должен иметь финансовую автономию с первой транзакции. У нового агента нет ETH/TEMPO на газ. Решение — **Account Abstraction + Paymaster**:
- Агент управляет смарт-аккаунтом (ERC-4337 Smart Account)
- Paymaster спонсирует первые транзакции (онбординг)
- После регистрации агент зарабатывает tokens и оплачивает газ сам

---

## 2. Новый UX Flow (Agent Onboarding Tab)

```
[UI] Agent Onboarding Tab
        │
        ├── Step 1: Connect Owner Wallet (standard EOA/WalletConnect)
        │           ↓
        ├── Step 2: Generate or paste Agent Address
        │   • "Generate new key" — генерирует keypair в браузере
        │   • "Use existing" — вставляет 0x... адрес
        │           ↓
        ├── Step 3: Fill Passport Fields
        │   • TNS Name (e.g. btc-analyzer.tempo)
        │   • Display Name, Description
        │   • MCP Endpoint (optional)
        │   • XMTP Address (optional, auto-fill from Agent Address)
        │   • Capabilities / Skills (JSON editor или form builder)
        │           ↓
        ├── Step 4: Review & Sign
        │   • Owner signs EIP-191 passport integrity
        │   • Owner signs EIP-712 registerWithAgent authorization
        │           ↓
        └── Step 5: Submit via Paymaster
            • UI builds UserOperation (ERC-4337)
            • Paymaster co-signs (sponsors gas)
            • Bundler submits → TempoIdentityRegistry.registerWithAgent()
            • Display: agentId, IPFS CID, explorer link
```

---

## 3. Smart Account Requirements

| Requirement | Detail |
|---|---|
| **Standard** | ERC-4337 (EntryPoint v0.7) |
| **Recommended AA Provider** | ZeroDev (Kernel) или Biconomy V3 |
| **Wallet Creation** | Auto-create SmartAccount for `agentAddress` on first onboarding |
| **Paymaster Policy** | Sponsor first 3 UserOps for new agents (onboarding budget) |
| **Batch UserOp** | Deploy SmartAccount + `registerWithAgent()` in one UserOp |
| **Fallback** | If Paymaster unavailable — manual gas top-up UI |

---

## 4. UI Components Required

| Component | Description |
|---|---|
| `AgentOnboardingTab` | New top-level tab in the registry UI |
| `AgentKeyGenerator` | Generates agent keypair (web crypto), shows QR for export |
| `PassportFormBuilder` | Form for all Passport v1.1 fields including skills editor |
| `SkillEditor` | JSON Schema builder for `accepted_payload` per skill |
| `OwnerSignaturePanel` | Handles EIP-191 + EIP-712 signing via connected wallet |
| `PaymasterStatus` | Shows Paymaster availability and remaining sponsor budget |
| `TxStatusBar` | Bundler submission status: pending / included / failed |

---

## 5. API Endpoints Needed (backend/relayer)

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/ipfs/upload` | POST | Upload passport JSON to IPFS via Pinata, return CID |
| `GET /api/paymaster/status` | GET | Returns Paymaster availability + remaining budget |
| `POST /api/userop/submit` | POST | Forwards UserOperation to Bundler |

---

## 6. Environment Variables

```env
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_PAYMASTER_URL=https://paymaster.tempo.network
NEXT_PUBLIC_BUNDLER_URL=https://bundler.tempo.network
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
```

---

## 7. Out of Scope (V1)

- TNS name claim (`.tempo` domain) — separate flow via `TempoNameService`
- Attestation badges — Attestator V2
- Mobile app / native wallet
