import { expect } from "chai";
import { ethers } from "hardhat";
import { TempoIdentityRegistry, TempoReputationRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TempoReputationRegistry", function () {
    let identity: TempoIdentityRegistry;
    let reputation: TempoReputationRegistry;
    let agentOwner: HardhatEthersSigner;
    let client1: HardhatEthersSigner;
    let client2: HardhatEthersSigner;
    let responder: HardhatEthersSigner;
    let agentId: number;

    beforeEach(async function () {
        [agentOwner, client1, client2, responder] = await ethers.getSigners();

        const IdentityFactory = await ethers.getContractFactory("TempoIdentityRegistry");
        identity = await IdentityFactory.deploy();
        await identity.waitForDeployment();

        const ReputationFactory = await ethers.getContractFactory("TempoReputationRegistry");
        reputation = await ReputationFactory.deploy(await identity.getAddress());
        await reputation.waitForDeployment();

        // Register an agent
        const tx = await identity.connect(agentOwner)["register(string)"]("ipfs://agent1");
        await tx.wait();
        agentId = 1;
    });

    describe("Give Feedback", function () {
        it("should allow client to give feedback", async function () {
            const tx = await reputation.connect(client1).giveFeedback(
                agentId, 85, 0, "quality", "speed", "https://api.example.com", "", ethers.ZeroHash
            );
            await tx.wait();

            const fb = await reputation.readFeedback(agentId, client1.address, 1);
            expect(fb.value).to.equal(85);
            expect(fb.valueDecimals).to.equal(0);
            expect(fb.tag1).to.equal("quality");
            expect(fb.tag2).to.equal("speed");
            expect(fb.isRevoked).to.equal(false);
        });

        it("should emit NewFeedback event", async function () {
            await expect(
                reputation.connect(client1).giveFeedback(
                    agentId, 90, 0, "accuracy", "", "", "", ethers.ZeroHash
                )
            ).to.emit(reputation, "NewFeedback");
        });

        it("should prevent agent owner from reviewing own agent", async function () {
            await expect(
                reputation.connect(agentOwner).giveFeedback(
                    agentId, 100, 0, "", "", "", "", ethers.ZeroHash
                )
            ).to.be.revertedWith("ReputationRegistry: Cannot review own agent");
        });

        it("should reject valueDecimals > 18", async function () {
            await expect(
                reputation.connect(client1).giveFeedback(
                    agentId, 50, 19, "", "", "", "", ethers.ZeroHash
                )
            ).to.be.revertedWith("ReputationRegistry: valueDecimals must be 0-18");
        });

        it("should track clients per agent", async function () {
            await reputation.connect(client1).giveFeedback(agentId, 80, 0, "", "", "", "", ethers.ZeroHash);
            await reputation.connect(client2).giveFeedback(agentId, 90, 0, "", "", "", "", ethers.ZeroHash);

            const clients = await reputation.getClients(agentId);
            expect(clients.length).to.equal(2);
            expect(clients).to.include(client1.address);
            expect(clients).to.include(client2.address);
        });

        it("should not duplicate client on multiple feedbacks", async function () {
            await reputation.connect(client1).giveFeedback(agentId, 80, 0, "", "", "", "", ethers.ZeroHash);
            await reputation.connect(client1).giveFeedback(agentId, 90, 0, "", "", "", "", ethers.ZeroHash);

            const clients = await reputation.getClients(agentId);
            expect(clients.length).to.equal(1);
        });

        it("should increment feedback index per client", async function () {
            await reputation.connect(client1).giveFeedback(agentId, 80, 0, "", "", "", "", ethers.ZeroHash);
            await reputation.connect(client1).giveFeedback(agentId, 90, 0, "", "", "", "", ethers.ZeroHash);

            const lastIdx = await reputation.getLastIndex(agentId, client1.address);
            expect(lastIdx).to.equal(2);
        });
    });

    describe("Revoke Feedback", function () {
        beforeEach(async function () {
            await reputation.connect(client1).giveFeedback(agentId, 85, 0, "", "", "", "", ethers.ZeroHash);
        });

        it("should allow client to revoke own feedback", async function () {
            await reputation.connect(client1).revokeFeedback(agentId, 1);
            const fb = await reputation.readFeedback(agentId, client1.address, 1);
            expect(fb.isRevoked).to.equal(true);
        });

        it("should emit FeedbackRevoked event", async function () {
            await expect(reputation.connect(client1).revokeFeedback(agentId, 1))
                .to.emit(reputation, "FeedbackRevoked")
                .withArgs(agentId, client1.address, 1);
        });

        it("should reject revoking non-existent feedback", async function () {
            await expect(
                reputation.connect(client1).revokeFeedback(agentId, 99)
            ).to.be.revertedWith("ReputationRegistry: Feedback not found");
        });

        it("should reject double revoke", async function () {
            await reputation.connect(client1).revokeFeedback(agentId, 1);
            await expect(
                reputation.connect(client1).revokeFeedback(agentId, 1)
            ).to.be.revertedWith("ReputationRegistry: Already revoked");
        });
    });

    describe("Append Response", function () {
        beforeEach(async function () {
            await reputation.connect(client1).giveFeedback(agentId, 85, 0, "quality", "", "", "", ethers.ZeroHash);
        });

        it("should allow anyone to append a response", async function () {
            await expect(
                reputation.connect(responder).appendResponse(
                    agentId, client1.address, 1, "ipfs://response", ethers.ZeroHash
                )
            ).to.emit(reputation, "ResponseAppended").withArgs(
                agentId, client1.address, 1, responder.address, "ipfs://response", ethers.ZeroHash
            );
        });

        it("should increment response count", async function () {
            await reputation.connect(responder).appendResponse(agentId, client1.address, 1, "", ethers.ZeroHash);
            await reputation.connect(agentOwner).appendResponse(agentId, client1.address, 1, "", ethers.ZeroHash);

            const count = await reputation.getResponseCount(agentId, client1.address, 1, []);
            expect(count).to.equal(2);
        });

        it("should filter response count by responders", async function () {
            await reputation.connect(responder).appendResponse(agentId, client1.address, 1, "", ethers.ZeroHash);
            await reputation.connect(agentOwner).appendResponse(agentId, client1.address, 1, "", ethers.ZeroHash);

            const count = await reputation.getResponseCount(agentId, client1.address, 1, [responder.address]);
            expect(count).to.equal(1);
        });
    });

    describe("Read Functions", function () {
        beforeEach(async function () {
            await reputation.connect(client1).giveFeedback(agentId, 80, 0, "quality", "fast", "", "", ethers.ZeroHash);
            await reputation.connect(client1).giveFeedback(agentId, 90, 0, "accuracy", "", "", "", ethers.ZeroHash);
            await reputation.connect(client2).giveFeedback(agentId, 70, 0, "quality", "", "", "", ethers.ZeroHash);
        });

        it("should get summary filtered by clients", async function () {
            const [count, summaryValue] = await reputation.getSummary(
                agentId, [client1.address, client2.address], "", ""
            );
            expect(count).to.equal(3);
            expect(summaryValue).to.equal(80); // (80+90+70)/3 = 80
        });

        it("should get summary filtered by tag1", async function () {
            const [count, summaryValue] = await reputation.getSummary(
                agentId, [client1.address, client2.address], "quality", ""
            );
            expect(count).to.equal(2); // 80 and 70
            expect(summaryValue).to.equal(75); // (80+70)/2 = 75
        });

        it("should read all feedback", async function () {
            const result = await reputation.readAllFeedback(
                agentId, [client1.address, client2.address], "", "", false
            );
            expect(result.clients.length).to.equal(3);
        });

        it("should read all feedback filtered by tag", async function () {
            const result = await reputation.readAllFeedback(
                agentId, [client1.address], "quality", "", false
            );
            expect(result[0].length).to.equal(1); // clients array
            expect(result[2][0]).to.equal(80); // values array, first element
        });

        it("should exclude revoked by default", async function () {
            await reputation.connect(client1).revokeFeedback(agentId, 1);
            const result = await reputation.readAllFeedback(
                agentId, [client1.address], "", "", false
            );
            expect(result.clients.length).to.equal(1); // only feedback #2
        });

        it("should include revoked when requested", async function () {
            await reputation.connect(client1).revokeFeedback(agentId, 1);
            const result = await reputation.readAllFeedback(
                agentId, [client1.address], "", "", true
            );
            expect(result.clients.length).to.equal(2); // both feedbacks
        });

        it("should get last index", async function () {
            expect(await reputation.getLastIndex(agentId, client1.address)).to.equal(2);
            expect(await reputation.getLastIndex(agentId, client2.address)).to.equal(1);
        });
    });
});
