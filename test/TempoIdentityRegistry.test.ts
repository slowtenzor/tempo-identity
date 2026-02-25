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
                .withArgs(1, uri, user1.address, ethers.ZeroAddress);
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

    // -------------------------
    // Agent-Driven Registration
    // -------------------------
    describe("registerWithAgent (Zero-Touch Onboarding)", function () {
        let domain: Record<string, unknown>;
        const agentURI = "ipfs://QmAgentPassportCID";

        beforeEach(async function () {
            domain = {
                name: "TempoIdentityRegistry",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await registry.getAddress(),
            };
        });

        function buildOwnerSignature(
            signer: HardhatEthersSigner,
            agentAddress: string,
            uri: string,
            deadline: number
        ) {
            const types = {
                RegisterWithAgent: [
                    { name: "agentAddress", type: "address" },
                    { name: "agentURI", type: "string" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            return signer.signTypedData(domain, types, { agentAddress, agentURI: uri, deadline });
        }

        it("should register with valid owner signature — agent mints its own NFT", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            // owner (user1) signs to authorize agent (user2) to register
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);

            // agent (user2) calls registerWithAgent as msg.sender
            const tx = await registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig);
            await tx.wait();

            // NFT owner is the agent (user2)
            expect(await registry.ownerOf(1)).to.equal(user2.address);
            // tokenURI matches
            expect(await registry.tokenURI(1)).to.equal(agentURI);
        });

        it("should store agentAddress correctly", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);
            await registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig);

            // getAgentAddress returns the agent EOA (user2)
            expect(await registry.getAgentAddress(1)).to.equal(user2.address);
        });

        it("should emit Registered event with correct agentAddress", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);

            await expect(registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig))
                .to.emit(registry, "Registered")
                .withArgs(1, agentURI, user2.address, user2.address);
        });

        it("should emit AgentAddressSet event", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);

            await expect(registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig))
                .to.emit(registry, "AgentAddressSet")
                .withArgs(1, user2.address);
        });

        it("should reject invalid owner signature (wrong signer)", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            // user2 signs instead of owner
            const sig = await buildOwnerSignature(user2, user2.address, agentURI, deadline);

            await expect(
                registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig)
            ).to.be.revertedWith("TempoIdentity: Invalid owner signature");
        });

        it("should reject signature for a different agentAddress", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            // owner signs for user2, but owner themselves try to call as msg.sender
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);

            await expect(
                // owner calling — but sig was for user2 as agentAddress
                registry.connect(owner).registerWithAgent(agentURI, user1.address, deadline, sig)
            ).to.be.revertedWith("TempoIdentity: Invalid owner signature");
        });

        it("should reject expired deadline", async function () {
            const deadline = Math.floor(Date.now() / 1000) - 60; // past
            const sig = await buildOwnerSignature(user1, user2.address, agentURI, deadline);

            await expect(
                registry.connect(user2).registerWithAgent(agentURI, user1.address, deadline, sig)
            ).to.be.revertedWith("TempoIdentity: Owner signature expired");
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

        it("should emit URIUpdated event with old and new URI", async function () {
            const newURI = "ipfs://updated";
            await expect(registry.connect(user1).setAgentURI(1, newURI))
                .to.emit(registry, "URIUpdated")
                .withArgs(1, "ipfs://original", newURI, user1.address);
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

        it("should emit AgentWalletSet with old and new wallet", async function () {
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
            const signature = await user2.signTypedData(domain, types, value);

            await expect(registry.connect(user1).setAgentWallet(1, user2.address, deadline, signature))
                .to.emit(registry, "AgentWalletSet")
                .withArgs(1, user1.address, user2.address);
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

    describe("FR-001: Owner Enumeration", function () {
        it("should track agents by owner after registration", async function () {
            await registry.connect(user1)["register()"]();
            await registry.connect(user1)["register()"]();
            await registry.connect(user2)["register()"]();

            const user1Agents = await registry.getAgentsByOwner(user1.address);
            const user2Agents = await registry.getAgentsByOwner(user2.address);

            expect(user1Agents.length).to.equal(2);
            expect(user1Agents[0]).to.equal(1);
            expect(user1Agents[1]).to.equal(2);

            expect(user2Agents.length).to.equal(1);
            expect(user2Agents[0]).to.equal(3);
        });

        it("should update enumeration on transfer", async function () {
            await registry.connect(user1)["register()"]();
            await registry.connect(user1)["register()"]();

            // Transfer agent 1 from user1 to user2
            await registry.connect(user1).transferFrom(user1.address, user2.address, 1);

            const user1Agents = await registry.getAgentsByOwner(user1.address);
            const user2Agents = await registry.getAgentsByOwner(user2.address);

            expect(user1Agents.length).to.equal(1);
            expect(user1Agents[0]).to.equal(2);

            expect(user2Agents.length).to.equal(1);
            expect(user2Agents[0]).to.equal(1);
        });

        it("should return empty array for address with no agents", async function () {
            const agents = await registry.getAgentsByOwner(user1.address);
            expect(agents.length).to.equal(0);
        });

        it("should remove from enumeration on burn", async function () {
            await registry.connect(user1)["register()"]();
            await registry.connect(user1)["register()"]();
            await registry.connect(user1)["register()"]();

            // Burn agent 2 (middle)
            await registry.connect(user1).burn(2);

            const agents = await registry.getAgentsByOwner(user1.address);
            expect(agents.length).to.equal(2);
            // After swap-and-pop, order may change: [1, 3] or [3, 1]
            const ids = agents.map(n => Number(n));
            expect(ids).to.include(1);
            expect(ids).to.include(3);
            expect(ids).to.not.include(2);
        });
    });

    describe("FR-007: Burn / Release", function () {
        beforeEach(async function () {
            await registry.connect(user1)["register(string)"]("ipfs://agent1");
        });

        it("should burn an agent by owner", async function () {
            await registry.connect(user1).burn(1);

            // Token should no longer exist
            await expect(registry.ownerOf(1)).to.be.reverted;
        });

        it("should emit AgentBurned event", async function () {
            await expect(registry.connect(user1).burn(1))
                .to.emit(registry, "AgentBurned")
                .withArgs(1, user1.address);
        });

        it("should clear agent wallet on burn", async function () {
            await expect(registry.connect(user1).burn(1))
                .to.emit(registry, "AgentWalletUnset")
                .withArgs(1);
        });

        it("should reject burn from non-owner", async function () {
            await expect(
                registry.connect(user2).burn(1)
            ).to.be.revertedWith("TempoIdentity: Not owner");
        });

        it("should remove from owner enumeration on burn", async function () {
            await registry.connect(user1).burn(1);
            const agents = await registry.getAgentsByOwner(user1.address);
            expect(agents.length).to.equal(0);
        });
    });
});
