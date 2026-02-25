import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // 1. Deploy TempoIdentityRegistry
    console.log("\n--- Deploying TempoIdentityRegistry ---");
    const IdentityFactory = await ethers.getContractFactory("TempoIdentityRegistry");
    const identity = await IdentityFactory.deploy();
    await identity.waitForDeployment();
    const identityAddress = await identity.getAddress();
    console.log("TempoIdentityRegistry deployed at:", identityAddress);

    // 2. Deploy TempoReputationRegistry
    console.log("\n--- Deploying TempoReputationRegistry ---");
    const ReputationFactory = await ethers.getContractFactory("TempoReputationRegistry");
    const reputation = await ReputationFactory.deploy(identityAddress);
    await reputation.waitForDeployment();
    const reputationAddress = await reputation.getAddress();
    console.log("TempoReputationRegistry deployed at:", reputationAddress);

    // 3. Deploy TempoNameService
    console.log("\n--- Deploying TempoNameService ---");
    const TNSFactory = await ethers.getContractFactory("TempoNameService");
    const tns = await TNSFactory.deploy(identityAddress);
    await tns.waitForDeployment();
    const tnsAddress = await tns.getAddress();
    console.log("TempoNameService deployed at:", tnsAddress);

    // Save deployment info
    const outPath = path.join(__dirname, "..", "deployments.json");

    // Preserve previous deployment in history
    let history: any[] = [];
    if (fs.existsSync(outPath)) {
        try {
            const prev = JSON.parse(fs.readFileSync(outPath, "utf-8"));
            if (prev.history) {
                history = prev.history;
            }
            // Archive current deployment (without its own history)
            const { history: _, ...prevDeployment } = prev;
            history.push(prevDeployment);
        } catch { }
    }

    const deployments = {
        version: "draft_v3",
        network: "tempoModerato",
        chainId: 42431,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        contracts: {
            TempoIdentityRegistry: identityAddress,
            TempoReputationRegistry: reputationAddress,
            TempoNameService: tnsAddress,
        },
        history,
    };

    fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployment info saved to deployments.json (draft_v3)");
    console.log(JSON.stringify(deployments, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
