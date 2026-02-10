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
    const deployments = {
        network: "tempoModerato",
        chainId: 42431,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        contracts: {
            TempoIdentityRegistry: identityAddress,
            TempoReputationRegistry: reputationAddress,
            TempoNameService: tnsAddress,
        },
    };

    const outPath = path.join(__dirname, "..", "deployments.json");
    fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployment info saved to deployments.json");
    console.log(JSON.stringify(deployments, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
