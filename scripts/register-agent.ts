/**
 * register-agent.ts — Agent-Driven Registration Script (draft_v3)
 *
 * Full Zero-Touch Onboarding flow:
 *   1. Build Agent Passport JSON (v1.1 schema)
 *   2. JCS canonicalize → keccak256 → EIP-191 sign (ownerAddress)
 *   3. Push to IPFS via Pinata → get CID
 *   4. EIP-712 sign ownerAddress authorization for registerWithAgent()
 *   5. Agent sends tx: registerWithAgent(cid, ownerAddress, deadline, sig)
 *   6. Print agentId and update deployments.json
 *
 * Usage:
 *   npx ts-node scripts/register-agent.ts \
 *     --name "btc-analyzer.tempo" \
 *     --display-name "BTC Analyzer" \
 *     --description "Analyzes BTC market data" \
 *     --mcp-endpoint "https://btc-analyzer.tempo.net/mcp" \
 *     --xmtp-address "0xAgentEOA..." \
 *     --owner-key "0xOwnerPrivKey..." \
 *     --agent-key "0xAgentPrivKey..."
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

// ─── Config ──────────────────────────────────────────────────────────────────

interface RegisterConfig {
    // Identity
    tnsName: string;           // e.g. "btc-analyzer.tempo"
    displayName: string;
    description: string;
    agentType: "BOT" | "INDIVIDUAL" | "ORG" | "DAO";

    // Endpoints
    mcpEndpoint?: string;
    xmtpAddress?: string;      // "0x..." — agent's XMTP EOA
    xmtpInboxId?: string;      // optional stable inbox ID

    // Skills / capabilities
    skills?: Skill[];
    protocols?: string[];

    // Keys (from env or args)
    ownerPrivateKey: string;   // human/DAO key — signs authorization
    agentPrivateKey: string;   // agent's EOA key — sends the tx

    // Registry (from deployments.json)
    registryAddress?: string;

    // Pinata config
    pinataApiKey?: string;
    pinataSecretKey?: string;
}

interface Skill {
    id: string;
    name: string;
    description?: string;
    accepted_payload: Record<string, unknown>;
    response_schema?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simple JCS (RFC 8785) canonicalization.
 * Sorts object keys recursively, no spaces.
 */
function jcsCanonicalize(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return "[" + (value as unknown[]).map(jcsCanonicalize).join(",") + "]";
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + jcsCanonicalize(obj[k])).join(",") + "}";
}

/**
 * Upload JSON to IPFS via Pinata.
 * Falls back to mock CID if no Pinata credentials provided (dev mode).
 */
async function uploadToIPFS(
    passport: Record<string, unknown>,
    apiKey?: string,
    secretKey?: string
): Promise<string> {
    const body = JSON.stringify(passport);

    if (!apiKey || !secretKey) {
        // Dev mode: compute deterministic mock CID
        const hash = ethers.keccak256(ethers.toUtf8Bytes(body));
        console.warn("⚠️  No Pinata credentials. Using mock CID (dev mode only).");
        console.warn("   Set PINATA_API_KEY and PINATA_SECRET_KEY for production.");
        return `ipfs://mock-${hash.slice(2, 18)}`;
    }

    console.log("📦  Uploading passport to IPFS via Pinata...");
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "pinata_api_key": apiKey,
            "pinata_secret_api_key": secretKey,
        },
        body: JSON.stringify({
            pinataContent: passport,
            pinataMetadata: { name: `agent-passport-${passport.id ? (passport.id as any).tns : "unknown"}` },
        }),
    });

    if (!response.ok) {
        throw new Error(`Pinata upload failed: ${response.status} ${await response.text()}`);
    }

    const result = await response.json() as { IpfsHash: string };
    return `ipfs://${result.IpfsHash}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    // --- 0. Load config from env ---
    const config: RegisterConfig = {
        tnsName: process.env.AGENT_TNS_NAME || "unnamed.tempo",
        displayName: process.env.AGENT_DISPLAY_NAME || "Unnamed Agent",
        description: process.env.AGENT_DESCRIPTION || "",
        agentType: (process.env.AGENT_TYPE || "BOT") as RegisterConfig["agentType"],
        mcpEndpoint: process.env.AGENT_MCP_ENDPOINT,
        xmtpAddress: process.env.AGENT_XMTP_ADDRESS,
        xmtpInboxId: process.env.AGENT_XMTP_INBOX_ID,
        protocols: (process.env.AGENT_PROTOCOLS || "mcp/1.0,xmtp/v3-mls").split(","),
        ownerPrivateKey: process.env.OWNER_PRIVATE_KEY || "",
        agentPrivateKey: process.env.AGENT_PRIVATE_KEY || "",
        registryAddress: process.env.REGISTRY_ADDRESS,
        pinataApiKey: process.env.PINATA_API_KEY,
        pinataSecretKey: process.env.PINATA_SECRET_KEY,
        skills: process.env.AGENT_SKILLS_JSON
            ? JSON.parse(process.env.AGENT_SKILLS_JSON)
            : [],
    };

    if (!config.ownerPrivateKey) throw new Error("OWNER_PRIVATE_KEY not set");
    if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY not set");

    // Load registry address from deployments.json if not set
    if (!config.registryAddress) {
        const deploymentsPath = path.join(__dirname, "..", "deployments.json");
        if (fs.existsSync(deploymentsPath)) {
            const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
            config.registryAddress = deployments.contracts?.TempoIdentityRegistry;
        }
    }
    if (!config.registryAddress) throw new Error("REGISTRY_ADDRESS not set and not found in deployments.json");

    // Create wallets
    const ownerWallet = new ethers.Wallet(config.ownerPrivateKey, ethers.provider);
    const agentWallet = new ethers.Wallet(config.agentPrivateKey, ethers.provider);

    console.log("🔑  Owner:", ownerWallet.address);
    console.log("🤖  Agent:", agentWallet.address);
    console.log("📋  Registry:", config.registryAddress);
    console.log("🌐  TNS Name:", config.tnsName);
    console.log("");

    // --- 1. Build Passport JSON ---
    const services: Record<string, unknown>[] = [];

    if (config.xmtpAddress) {
        const xmtpService: Record<string, unknown> = {
            name: "XMTP",
            endpoint: `xmtp:${config.xmtpAddress}`,
            version: "v3-mls",
        };
        if (config.xmtpInboxId) xmtpService.metadata = { inboxId: config.xmtpInboxId };
        services.push(xmtpService);
    }

    if (config.mcpEndpoint) {
        services.push({ name: "MCP", endpoint: config.mcpEndpoint, version: "2025-06-18" });
    }

    // Always include Payment pointing to agent wallet
    services.push({ name: "Payment", endpoint: agentWallet.address, version: "EVM" });

    const passport: Record<string, unknown> = {
        schemaVersion: "1.1.0",
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        issuedAt: new Date().toISOString(),
        id: {
            tns: config.tnsName,
        },
        ownership: {
            ownerAddress: ownerWallet.address,
            agentAddress: agentWallet.address,
        },
        agent: {
            type: config.agentType,
            displayName: config.displayName,
            description: config.description,
        },
        services,
        capabilities: {
            protocols: config.protocols || [],
            skills: config.skills || [],
        },
        routing: {
            ...(config.xmtpAddress && { xmtpAddress: `xmtp:${config.xmtpAddress}` }),
            ...(config.mcpEndpoint && { mcpEndpoint: config.mcpEndpoint }),
            paymentWallet: agentWallet.address,
        },
    };

    console.log("📄  Built passport JSON.");

    // --- 2. Sign passport content (EIP-191, ownerAddress) ---
    const passportWithoutIntegrity = { ...passport };
    const canonical = jcsCanonicalize(passportWithoutIntegrity);
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
    const integritySignature = await ownerWallet.signMessage(ethers.getBytes(contentHash));

    passport.integrity = {
        hash: contentHash,
        signature: {
            type: "EIP191",
            value: integritySignature,
            signer: ownerWallet.address,
        },
    };

    console.log("✍️   Passport signed by owner.");

    // --- 3. Upload to IPFS ---
    const ipfsCID = await uploadToIPFS(passport, config.pinataApiKey, config.pinataSecretKey);
    console.log("📌  IPFS CID:", ipfsCID);

    // --- 4. EIP-712 owner authorization for registerWithAgent() ---
    const registry = await ethers.getContractAt("TempoIdentityRegistry", config.registryAddress);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const domain = {
        name: "TempoIdentityRegistry",
        version: "1",
        chainId,
        verifyingContract: config.registryAddress,
    };
    const types = {
        RegisterWithAgent: [
            { name: "agentAddress", type: "address" },
            { name: "agentURI", type: "string" },
            { name: "deadline", type: "uint256" },
        ],
    };
    const ownerSig = await ownerWallet.signTypedData(domain, types, {
        agentAddress: agentWallet.address,
        agentURI: ipfsCID,
        deadline,
    });

    console.log("✍️   Owner EIP-712 authorization signed.");

    // --- 5. Agent sends registerWithAgent tx ---
    console.log("\n🚀  Sending registerWithAgent transaction...");
    const registryAsAgent = registry.connect(agentWallet);
    const tx = await registryAsAgent.registerWithAgent(
        ipfsCID,
        ownerWallet.address,
        deadline,
        ownerSig
    );

    console.log("   Tx hash:", tx.hash);
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction failed — no receipt");

    // Parse agentId from Registered event
    const registeredEvent = receipt.logs.find((log: any) => {
        try {
            const parsed = registry.interface.parseLog(log);
            return parsed?.name === "Registered";
        } catch { return false; }
    });

    let agentId: bigint | undefined;
    if (registeredEvent) {
        const parsed = registry.interface.parseLog(registeredEvent as any);
        agentId = parsed?.args[0] as bigint;
    }

    console.log("\n✅  Registration successful!");
    console.log("   Agent ID:", agentId?.toString());
    console.log("   NFT Owner:", agentWallet.address);
    console.log("   Passport URI:", ipfsCID);
    console.log("   Explorer:", `https://explore.tempo.xyz/token/${config.registryAddress}?a=${agentId}`);

    // --- 6. Update deployments.json ---
    const deploymentsPath = path.join(__dirname, "..", "deployments.json");
    let deployments: Record<string, unknown> = {};
    if (fs.existsSync(deploymentsPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
    }

    const agents = (deployments.agents as Record<string, unknown>[] | undefined) || [];
    agents.push({
        agentId: agentId?.toString(),
        tnsName: config.tnsName,
        agentAddress: agentWallet.address,
        ownerAddress: ownerWallet.address,
        passportCID: ipfsCID,
        registeredAt: new Date().toISOString(),
        txHash: tx.hash,
    });
    deployments.agents = agents;

    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n💾  Agent registration saved to deployments.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Registration failed:", error.message);
        process.exit(1);
    });
