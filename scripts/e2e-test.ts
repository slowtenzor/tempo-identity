import { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Read deployed addresses
const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
);

// Agent passport templates
function createPassport(
    tns: string,
    agentType: "INDIVIDUAL" | "ORG" | "DAO" | "BOT",
    displayName: string,
    description: string,
    services: { name: string; endpoint: string; version?: string }[]
) {
    return {
        schemaVersion: "1.0.0",
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        issuedAt: new Date().toISOString(),
        id: {
            tns: `${tns}.tempo`,
        },
        agent: {
            type: agentType,
            displayName,
            description,
        },
        services,
        routing: {
            mcpEndpoint: services.find((s) => s.name === "MCP")?.endpoint || "",
        },
        proofs: [
            {
                type: "GITHUB",
                value: "slowtenzor/tempo-identity",
            },
        ],
    };
}

async function uploadToIPFS(data: object): Promise<string> {
    const json = JSON.stringify(data, null, 2);
    const tmpFile = path.join(__dirname, "..", "tmp_passport.json");
    fs.writeFileSync(tmpFile, json);

    try {
        const result = execSync(`ipfs add -q "${tmpFile}"`, { encoding: "utf8" }).trim();
        // Pin it
        execSync(`ipfs pin add ${result}`, { encoding: "utf8" });
        fs.unlinkSync(tmpFile);
        return `ipfs://${result}`;
    } catch (error) {
        fs.unlinkSync(tmpFile);
        throw new Error(`IPFS upload failed: ${error}`);
    }
}

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("=".repeat(60));
    console.log("TEMPO IDENTITY — FULL E2E TEST (LIVE TESTNET)");
    console.log("=".repeat(60));
    console.log("Deployer:", deployer.address);
    console.log("Network: Tempo Moderato (chainId 42431)");
    console.log();

    // Connect to deployed contracts
    const identity = await ethers.getContractAt(
        "TempoIdentityRegistry",
        deployments.contracts.TempoIdentityRegistry
    );
    const reputation = await ethers.getContractAt(
        "TempoReputationRegistry",
        deployments.contracts.TempoReputationRegistry
    );
    const tns = await ethers.getContractAt(
        "TempoNameService",
        deployments.contracts.TempoNameService
    );

    // ==========================================
    // 1. CREATE AGENT PASSPORTS & UPLOAD TO IPFS
    // ==========================================
    console.log("📄 Step 1: Creating Agent Passports & Uploading to IPFS...\n");

    const passports = [
        {
            name: "vpn",
            passport: createPassport("vpn", "BOT", "Tempo VPN Agent", "Premium High-Speed VPN Agent. Zero logs, instant access.", [
                { name: "MCP", endpoint: "wss://vpn.tempo.xyz/mcp", version: "2026-02-10" },
                { name: "Payment", endpoint: deployer.address, version: "EVM" },
            ]),
        },
        {
            name: "shop",
            passport: createPassport("shop", "ORG", "Tempo Shop", "Official marketplace for digital goods and services.", [
                { name: "MCP", endpoint: "wss://shop.tempo.xyz/mcp", version: "2026-02-10" },
                { name: "Payment", endpoint: deployer.address, version: "EVM" },
                { name: "Web", endpoint: "https://shop.tempo.xyz" },
            ]),
        },
        {
            name: "alice",
            passport: createPassport("alice", "INDIVIDUAL", "Alice", "Independent AI researcher and consultant.", [
                { name: "MCP", endpoint: "wss://alice.tempo.xyz/mcp", version: "2026-02-10" },
            ]),
        },
    ];

    const ipfsURIs: string[] = [];
    for (const p of passports) {
        const uri = await uploadToIPFS(p.passport);
        ipfsURIs.push(uri);
        console.log(`  ✅ ${p.name}.tempo → ${uri}`);
    }
    console.log();

    // ==========================================
    // 2. REGISTER AGENTS ON-CHAIN
    // ==========================================
    console.log("🔗 Step 2: Registering Agents On-Chain...\n");

    const agentIds: number[] = [];
    for (let i = 0; i < passports.length; i++) {
        const metadata = [
            { metadataKey: "agentType", metadataValue: ethers.toUtf8Bytes(passports[i].passport.agent.type) },
            { metadataKey: "category", metadataValue: ethers.toUtf8Bytes(passports[i].name === "vpn" ? "Network Utility" : passports[i].name === "shop" ? "Marketplace" : "Consulting") },
        ];

        const tx = await identity["register(string,(string,bytes)[])"](ipfsURIs[i], metadata);
        const receipt = await tx.wait();

        // Get agentId from Registered event
        const event = receipt?.logs.find((log: any) => {
            try {
                return identity.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "Registered";
            } catch { return false; }
        });
        const parsed = identity.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
        const agentId = Number(parsed!.args[0]);
        agentIds.push(agentId);

        console.log(`  ✅ ${passports[i].name}.tempo registered → agentId: ${agentId}`);
        console.log(`     TX: ${receipt?.hash}`);
        console.log(`     URI: ${ipfsURIs[i]}`);

        // Verify on-chain metadata
        const storedType = await identity.getMetadata(agentId, "agentType");
        console.log(`     On-chain agentType: ${ethers.toUtf8String(storedType)}`);
        console.log();
    }

    // ==========================================
    // 3. REGISTER TNS NAMES
    // ==========================================
    console.log("🏷️  Step 3: Registering TNS Names...\n");

    for (let i = 0; i < passports.length; i++) {
        const tx = await tns.registerName(passports[i].name, agentIds[i]);
        const receipt = await tx.wait();
        console.log(`  ✅ "${passports[i].name}" → agentId ${agentIds[i]}`);
        console.log(`     TX: ${receipt?.hash}`);

        // Verify resolution
        const resolved = await tns.resolveName(passports[i].name);
        const reverse = await tns.reverseResolve(agentIds[i]);
        const ownerAddr = await tns.resolveOwner(passports[i].name);
        console.log(`     Forward: resolveName("${passports[i].name}") = ${resolved}`);
        console.log(`     Reverse: reverseResolve(${agentIds[i]}) = "${reverse}"`);
        console.log(`     Owner: ${ownerAddr}`);
        console.log();
    }

    // ==========================================
    // 4. GIVE FEEDBACK (REPUTATION)
    // ==========================================
    console.log("⭐ Step 4: Giving Feedback...\n");
    console.log("  ⚠️  Skipped: Self-review prevention blocks single-wallet feedback.");
    console.log("     (Need a second wallet to give feedback to agents owned by deployer)\n");

    // We can still verify that self-review prevention works
    try {
        await reputation.giveFeedback(agentIds[0], 85, 0, "quality", "fast", "https://vpn.tempo.xyz", "", ethers.ZeroHash);
        console.log("  ❌ Self-review NOT blocked (unexpected!)");
    } catch (e: any) {
        console.log("  ✅ Self-review correctly blocked: " + (e.reason || "Cannot review own agent"));
    }
    console.log();

    // ==========================================
    // 5. VERIFICATION SUMMARY
    // ==========================================
    console.log("=".repeat(60));
    console.log("📋 VERIFICATION SUMMARY");
    console.log("=".repeat(60));
    console.log();
    console.log("Contracts:");
    console.log(`  Identity:   ${deployments.contracts.TempoIdentityRegistry}`);
    console.log(`  Reputation: ${deployments.contracts.TempoReputationRegistry}`);
    console.log(`  TNS:        ${deployments.contracts.TempoNameService}`);
    console.log();
    console.log("Registered Agents:");
    for (let i = 0; i < passports.length; i++) {
        const uri = await identity.tokenURI(agentIds[i]);
        const wallet = await identity.getAgentWallet(agentIds[i]);
        console.log(`  [${agentIds[i]}] ${passports[i].name}.tempo (${passports[i].passport.agent.type})`);
        console.log(`      URI: ${uri}`);
        console.log(`      Wallet: ${wallet}`);
        console.log(`      IPFS Gateway: https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`);
    }
    console.log();
    console.log("TNS Resolution:");
    for (const p of passports) {
        const id = await tns.resolveName(p.name);
        console.log(`  ${p.name}.tempo → agentId ${id}`);
    }
    console.log();
    console.log("Explorer Links:");
    for (let i = 0; i < passports.length; i++) {
        console.log(`  ${passports[i].name}.tempo: https://explore.tempo.xyz/token/${deployments.contracts.TempoIdentityRegistry}/instance/${agentIds[i]}`);
    }
    console.log();
    console.log("✅ E2E test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ E2E test failed:", error);
        process.exit(1);
    });
