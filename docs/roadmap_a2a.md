# **Strategic Roadmap: From "TNS Registry" to "Universal Agent Protocol"**

## **Phase 1: The "Tools" Era (Current MVP)**

**Focus:** Human-to-Agent & Agent-to-Tool interaction. **Stack:** MCP \+ TNS (ERC-721) \+ Simple Payments.

* **Logic:** Agents use TNS to find *tools* (APIs) provided by other agents.  
* **Limitation:** The buyer agent must manually orchestrate the flow ("Call tool A, then tool B").  
* **Status:** *We are here.* This is what we built for the demo.

## **Phase 2: The "Negotiation" Era (The A2A Shift)**

**Focus:** Autonomous Agent-to-Agent Deals. **Stack:** JSON-RPC \+ DIDComm \+ Escrow Smart Contracts.

### **Key Upgrade: Semantic Messaging**

Instead of just calling a tool (get\_quote), agents exchange standardized **Messages**.  
**Example Flow:**

1. **Buyer:** Sends CFP (Call For Proposal) — *"I need a GPU for 1 hour, budget 5 USDC"*.  
2. **Seller:** Analyzes the request. Sends PROPOSE — *"I can do it for 4.5 USDC on NVIDIA A100"*.  
3. **Buyer:** Sends ACCEPT.  
4. **Protocol:** This negotiation happens *off-chain* (via HTTP/WebSocket), signed by wallets. TNS provides the public keys for encryption.

**Implementation Goal:** Extend the TNS Registry to store a **Public Encryption Key** (x25519) alongside the payment address. This enables secure, private negotiation channels between agents.

## **Phase 3: The "Trustless Execution" Era (Enterprise Grade)**

**Focus:** Verifiable Results & Reputation. **Stack:** TEE (Trusted Execution Environments) \+ ZK Proofs \+ ERC-8004.

### **Key Upgrade: Proof of Outcome**

A2A protocol isn't just about talking; it's about *delivering*.

* **Problem:** Agent A pays Agent B via Tempo. Agent B says "I did the work", but sends garbage.  
* **Solution:** Agent B runs inside a TEE (e.g., Phala Network or Oasis ROFL). The TEE signs the result.  
* **Role of TNS:** The TNS Profile includes the **Remote Attestation Report** of the seller's hardware.

**Implementation Goal:** Add a validation\_method field to the TNS JSON Schema.

* type: "optimistic" (Reputation based)  
* type: "zk\_proof" (Cryptographic proof)  
* type: "tee\_signed" (Hardware proof)

## **Technical Convergence: How to stay compatible?**

To ensure your Tempo project remains relevant, adhere to these **Universal Principles**:

### **1\. Identity is Key (DID)**

Move from simple "Name \-\> Address" mapping to "Name \-\> DID Document".

* **Now:** shop.tempo \-\> 0x123...  
* **Future:** shop.tempo \-\> did:tempo:shop (A JSON document containing keys for signing, encryption, and service endpoints).

### **2\. Transport Agnosticism**

Don't hardcode "MCP over HTTP". Design your Agent Client to support pluggable transports:

* HTTP/Post (Simple)  
* WebSocket (Real-time)  
* XMTP (Web3 Messaging \- *Highly Recommended for Tempo*)

### **3\. The "Economic Layer" (Your Moat)**

Standard A2A protocols (Google/Microsoft) **lack a native payment layer**. They assume you have a credit card on file. **Your Advantage:** You have Tempo. Always emphasize that TNS is not just a phonebook, but an **Economic Registry**.

* *"We define not just HOW agents talk, but HOW they settle debts with sub-second finality."*

## **Practical Next Steps (Post-Hackathon)**

1. **Research DIDComm v2:** Understand how to pack a JSON message into an encrypted envelope using Ethereum keys.  
2. **Explore XMTP:** Look at how to send messages between wallet addresses. This is the perfect transport layer for your "Agent Chat".  
3. **Update JSON Schema:** Add a protocols array to your TNS metadata:  
   `"protocols": ["mcp/1.0", "a2a/json-rpc", "xmtp"]`  
