import { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
);

function fetchFromIPFS(cid: string): any {
    try {
        const raw = execSync(`ipfs cat ${cid}`, { encoding: "utf8", timeout: 10000 });
        return JSON.parse(raw);
    } catch {
        try {
            const raw = execSync(`curl -s "https://ipfs.io/ipfs/${cid}"`, { encoding: "utf8", timeout: 15000 });
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
}

function line(label: string, value: string, indent = 0) {
    const pad = " ".repeat(indent);
    console.log(`${pad}${label.padEnd(20 - indent)} ${value}`);
}

function separator(char = "─", len = 64) {
    console.log(char.repeat(len));
}

function header(title: string) {
    console.log();
    separator("═");
    console.log(`  ${title}`);
    separator("═");
}

async function main() {
    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

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

    header("TEMPO IDENTITY REGISTRY — STATE INSPECTOR");
    console.log();
    line("Network", `Tempo Moderato (chainId ${network.chainId})`);
    line("Inspector", signer.address);
    line("Timestamp", new Date().toISOString());

    header("DEPLOYED CONTRACTS");
    console.log();
    line("Identity", deployments.contracts.TempoIdentityRegistry);
    line("Reputation", deployments.contracts.TempoReputationRegistry);
    line("TNS", deployments.contracts.TempoNameService);
    console.log();
    console.log("  Explorer:");
    console.log(`    https://explore.tempo.xyz/address/${deployments.contracts.TempoIdentityRegistry}`);
    console.log(`    https://explore.tempo.xyz/address/${deployments.contracts.TempoReputationRegistry}`);
    console.log(`    https://explore.tempo.xyz/address/${deployments.contracts.TempoNameService}`);

    // Discover all agents by iterating token IDs
    header("REGISTERED AGENTS");
    console.log();

    let agentId = 1;
    const agents: any[] = [];

    while (true) {
        try {
            const owner = await identity.ownerOf(agentId);
            const uri = await identity.tokenURI(agentId);
            const wallet = await identity.getAgentWallet(agentId);
            const agentType = await identity.getMetadata(agentId, "agentType").then(
                (b: string) => ethers.toUtf8String(b)
            ).catch(() => "—");
            const category = await identity.getMetadata(agentId, "category").then(
                (b: string) => ethers.toUtf8String(b)
            ).catch(() => "—");

            // TNS reverse
            const tnsName = await tns.reverseResolve(agentId).catch(() => "");

            // Fetch IPFS passport
            const cid = uri.replace("ipfs://", "");
            const passport = fetchFromIPFS(cid);

            agents.push({ agentId, owner, uri, wallet, agentType, category, tnsName, passport, cid });
            agentId++;
        } catch {
            break; // No more agents
        }
    }

    if (agents.length === 0) {
        console.log("  (no agents registered)");
    }

    for (const a of agents) {
        separator("─");
        console.log(`  Agent #${a.agentId}${a.tnsName ? ` — ${a.tnsName}.tempo` : ""}`);
        separator("─");
        line("Agent ID", String(a.agentId), 2);
        line("Owner", a.owner, 2);
        line("Agent Wallet", a.wallet, 2);
        line("Agent Type", a.agentType, 2);
        line("Category", a.category, 2);
        line("Token URI", a.uri, 2);
        if (a.tnsName) {
            line("TNS Name", `${a.tnsName}.tempo`, 2);
            // Verify forward resolution
            const forwardId = await tns.resolveName(a.tnsName);
            line("TNS Verified", forwardId == a.agentId ? "✓ forward=reverse" : "✗ mismatch!", 2);
        } else {
            line("TNS Name", "(none)", 2);
        }
        console.log();

        // Passport details
        if (a.passport) {
            console.log("    📄 IPFS Passport:");
            line("Schema", a.passport.schemaVersion || "—", 6);
            line("Issued", a.passport.issuedAt || "—", 6);
            if (a.passport.agent) {
                line("Display Name", a.passport.agent.displayName || "—", 6);
                line("Type", a.passport.agent.type || "—", 6);
                line("Description", a.passport.agent.description || "—", 6);
            }
            if (a.passport.services && a.passport.services.length > 0) {
                console.log("      Services:");
                for (const s of a.passport.services) {
                    console.log(`        • ${s.name}: ${s.endpoint}${s.version ? ` (${s.version})` : ""}`);
                }
            }
            if (a.passport.proofs && a.passport.proofs.length > 0) {
                console.log("      Proofs:");
                for (const p of a.passport.proofs) {
                    console.log(`        • ${p.type}: ${p.value}`);
                }
            }
            line("IPFS Gateway", `https://ipfs.io/ipfs/${a.cid}`, 6);
        } else {
            console.log("    📄 IPFS Passport: (not available)");
        }
        console.log();

        // Reputation
        const clients = await reputation.getClients(a.agentId);
        if (clients.length > 0) {
            console.log("    ⭐ Reputation:");
            line("Clients", String(clients.length), 6);
            for (const client of clients) {
                const lastIdx = await reputation.getLastIndex(a.agentId, client);
                console.log(`      • ${client} (${lastIdx} feedback${Number(lastIdx) > 1 ? "s" : ""})`);
                for (let i = 1; i <= Number(lastIdx); i++) {
                    const fb = await reputation.readFeedback(a.agentId, client, i);
                    const status = fb.isRevoked ? "REVOKED" : "active";
                    console.log(`          [${i}] value=${fb.value} tag1="${fb.tag1}" tag2="${fb.tag2}" (${status})`);
                }
            }
        } else {
            console.log("    ⭐ Reputation: (no feedback yet)");
        }
        console.log();
    }

    // TNS Overview
    header("TNS NAME RESOLUTION TABLE");
    console.log();
    console.log("  Name".padEnd(22) + "agentId".padEnd(12) + "Owner");
    separator("─");
    for (const a of agents) {
        if (a.tnsName) {
            console.log(`  ${(a.tnsName + ".tempo").padEnd(20)}${String(a.agentId).padEnd(12)}${a.owner}`);
        }
    }

    // Summary
    header("TOTALS");
    console.log();
    line("Total Agents", String(agents.length));
    line("With TNS Name", String(agents.filter(a => a.tnsName).length));
    line("With Passport", String(agents.filter(a => a.passport).length));
    line("With Feedback", String(agents.filter(a => false).length)); // would need async check
    const types: Record<string, number> = {};
    for (const a of agents) {
        types[a.agentType] = (types[a.agentType] || 0) + 1;
    }
    console.log();
    console.log("  By Type:");
    for (const [t, c] of Object.entries(types)) {
        console.log(`    ${t}: ${c}`);
    }
    console.log();
    separator("═");
    console.log("  ✅ Inspection complete");
    separator("═");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Inspection failed:", error);
        process.exit(1);
    });
