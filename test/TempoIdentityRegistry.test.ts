import { expect } from "chai";
import { ethers } from "hardhat";
import { TempoIdentityRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TempoIdentityRegistry", function () {
    let registry: TempoIdentityRegistry;
    let owner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("TempoIdentityRegistry");
        registry = await Factory.deploy();
        await registry.waitForDeployment();
    });

    describe("Registration", function () {
        it("should register an agent with no URI", async function () {
            const tx = await registry.connect(user1)["register()"]();
            const receipt = await tx.wait();
            expect(receipt).to.not.be.null;

            // agentId should be 1
            const wallet = await registry.getAgentWallet(1);
            expect(wallet).to.equal(user1.address);
        });

        it("should register an agent with URI", async function () {
            const uri = "ipfs://QmTestHash123";
            const tx = await registry.connect(user1)["register(string)"](uri);
            await tx.wait();

            const tokenURI = await registry.tokenURI(1);
            expect(tokenURI).to.equal(uri);
        });

        it("should register with URI and metadata", async function () {
            const uri = "ipfs://QmTestHash123";
            const metadata = [
                { metadataKey: "category", metadataValue: ethers.toUtf8Bytes("VPN") },
            ];
            const tx = await registry.connect(user1)["register(string,(string,bytes)[])"](uri, metadata);
            await tx.wait();

            const stored = await registry.getMetadata(1, "category");
            expect(ethers.toUtf8String(stored)).to.equal("VPN");
        });

        it("should reject agentWallet key in metadata during registration", async function () {
            const metadata = [
                { metadataKey: "agentWallet", metadataValue: ethers.toUtf8Bytes("0x123") },
            ];
            await expect(
                registry.connect(user1)["register(string,(string,bytes)[])"]("ipfs://test", metadata)
            ).to.be.revertedWith("TempoIdentity: agentWallet is reserved");
        });

        it("should emit Registered event", async function () {
            const uri = "ipfs://QmTestHash123";
            await expect(registry.connect(user1)["register(string)"](uri))
                .to.emit(registry, "Registered")
                .withArgs(1, uri, user1.address);
        });

        it("should auto-increment agentIds", async function () {
            await registry.connect(user1)["register()"]();
            await registry.connect(user2)["register()"]();

            const wallet1 = await registry.getAgentWallet(1);
            const wallet2 = await registry.getAgentWallet(2);
            expect(wallet1).to.equal(user1.address);
            expect(wallet2).to.equal(user2.address);
        });
    });

    describe("Agent URI", function () {
        beforeEach(async function () {
            await registry.connect(user1)["register(string)"]("ipfs://original");
        });

        it("should update agentURI by owner", async function () {
            const newURI = "ipfs://updated";
            await registry.connect(user1).setAgentURI(1, newURI);
            expect(await registry.tokenURI(1)).to.equal(newURI);
        });

        it("should emit URIUpdated event", async function () {
            const newURI = "ipfs://updated";
            await expect(registry.connect(user1).setAgentURI(1, newURI))
                .to.emit(registry, "URIUpdated")
                .withArgs(1, newURI, user1.address);
        });

        it("should reject URI update from non-owner", async function () {
            await expect(
                registry.connect(user2).setAgentURI(1, "ipfs://hacked")
            ).to.be.reverted;
        });
    });

    describe("On-chain Metadata", function () {
        beforeEach(async function () {
            await registry.connect(user1)["register()"]();
        });

        it("should set and get metadata", async function () {
            const key = "category";
            const value = ethers.toUtf8Bytes("DeFi Agent");
            await registry.connect(user1).setMetadata(1, key, value);

            const stored = await registry.getMetadata(1, key);
            expect(ethers.toUtf8String(stored)).to.equal("DeFi Agent");
        });

        it("should emit MetadataSet event", async function () {
            const key = "category";
            const value = ethers.toUtf8Bytes("DeFi");
            await expect(registry.connect(user1).setMetadata(1, key, value))
                .to.emit(registry, "MetadataSet");
        });

        it("should reject agentWallet key via setMetadata", async function () {
            await expect(
                registry.connect(user1).setMetadata(1, "agentWallet", ethers.toUtf8Bytes("0x123"))
            ).to.be.revertedWith("TempoIdentity: agentWallet is reserved, use setAgentWallet");
        });

        it("should reject metadata update from non-owner", async function () {
            await expect(
                registry.connect(user2).setMetadata(1, "key", ethers.toUtf8Bytes("val"))
            ).to.be.reverted;
        });
    });

    describe("Agent Wallet", function () {
        beforeEach(async function () {
            await registry.connect(user1)["register()"]();
        });

        it("should default agent wallet to owner", async function () {
            expect(await registry.getAgentWallet(1)).to.equal(user1.address);
        });

        it("should set agent wallet with valid EIP-712 signature", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {
                name: "TempoIdentityRegistry",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await registry.getAddress(),
            };
            const types = {
                SetAgentWallet: [
                    { name: "agentId", type: "uint256" },
                    { name: "newWallet", type: "address" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const value = { agentId: 1, newWallet: user2.address, deadline };

            // user2 signs to prove they control the new wallet
            const signature = await user2.signTypedData(domain, types, value);

            await registry.connect(user1).setAgentWallet(1, user2.address, deadline, signature);
            expect(await registry.getAgentWallet(1)).to.equal(user2.address);
        });

        it("should reject expired signature", async function () {
            const deadline = Math.floor(Date.now() / 1000) - 3600; // in the past
            const domain = {
                name: "TempoIdentityRegistry",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await registry.getAddress(),
            };
            const types = {
                SetAgentWallet: [
                    { name: "agentId", type: "uint256" },
                    { name: "newWallet", type: "address" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const value = { agentId: 1, newWallet: user2.address, deadline };
            const signature = await user2.signTypedData(domain, types, value);

            await expect(
                registry.connect(user1).setAgentWallet(1, user2.address, deadline, signature)
            ).to.be.revertedWith("TempoIdentity: Signature expired");
        });

        it("should reject invalid signature (wrong signer)", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const domain = {
                name: "TempoIdentityRegistry",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await registry.getAddress(),
            };
            const types = {
                SetAgentWallet: [
                    { name: "agentId", type: "uint256" },
                    { name: "newWallet", type: "address" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const value = { agentId: 1, newWallet: user2.address, deadline };

            // owner signs instead of user2 — wrong signer
            const signature = await owner.signTypedData(domain, types, value);

            await expect(
                registry.connect(user1).setAgentWallet(1, user2.address, deadline, signature)
            ).to.be.revertedWith("TempoIdentity: Invalid wallet signature");
        });

        it("should unset agent wallet", async function () {
            await registry.connect(user1).unsetAgentWallet(1);
            expect(await registry.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
        });

        it("should auto-clear agent wallet on transfer", async function () {
            // Transfer NFT from user1 to user2
            await registry.connect(user1).transferFrom(user1.address, user2.address, 1);

            // Agent wallet should be cleared
            expect(await registry.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
        });
    });
});
