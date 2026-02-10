import { expect } from "chai";
import { ethers } from "hardhat";
import { TempoIdentityRegistry, TempoNameService } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TempoNameService", function () {
    let identity: TempoIdentityRegistry;
    let tns: TempoNameService;
    let owner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const IdentityFactory = await ethers.getContractFactory("TempoIdentityRegistry");
        identity = await IdentityFactory.deploy();
        await identity.waitForDeployment();

        const TNSFactory = await ethers.getContractFactory("TempoNameService");
        tns = await TNSFactory.deploy(await identity.getAddress());
        await tns.waitForDeployment();

        // Register agents
        await identity.connect(user1)["register(string)"]("ipfs://agent1");
        await identity.connect(user2)["register(string)"]("ipfs://agent2");
    });

    describe("Name Registration", function () {
        it("should register a name for owned agent", async function () {
            await tns.connect(user1).registerName("vpn", 1);
            expect(await tns.resolveName("vpn")).to.equal(1);
        });

        it("should emit NameRegistered event", async function () {
            await expect(tns.connect(user1).registerName("vpn", 1))
                .to.emit(tns, "NameRegistered");
        });

        it("should reject registration from non-owner", async function () {
            await expect(
                tns.connect(user2).registerName("vpn", 1)
            ).to.be.revertedWith("TNS: Not agent owner");
        });

        it("should reject duplicate name", async function () {
            await tns.connect(user1).registerName("vpn", 1);
            await expect(
                tns.connect(user2).registerName("vpn", 2)
            ).to.be.revertedWith("TNS: Name already taken");
        });

        it("should reject empty name", async function () {
            await expect(
                tns.connect(user1).registerName("", 1)
            ).to.be.revertedWith("TNS: Name cannot be empty");
        });

        it("should reject if agent already has a name", async function () {
            await tns.connect(user1).registerName("vpn", 1);
            await expect(
                tns.connect(user1).registerName("vpn2", 1)
            ).to.be.revertedWith("TNS: Agent already has a name");
        });
    });

    describe("Name Release", function () {
        beforeEach(async function () {
            await tns.connect(user1).registerName("vpn", 1);
        });

        it("should release a name", async function () {
            await tns.connect(user1).releaseName("vpn");
            expect(await tns.resolveName("vpn")).to.equal(0);
        });

        it("should emit NameReleased event", async function () {
            await expect(tns.connect(user1).releaseName("vpn"))
                .to.emit(tns, "NameReleased");
        });

        it("should allow re-registration after release", async function () {
            await tns.connect(user1).releaseName("vpn");
            await tns.connect(user2).registerName("vpn", 2);
            expect(await tns.resolveName("vpn")).to.equal(2);
        });

        it("should reject release from non-owner", async function () {
            await expect(
                tns.connect(user2).releaseName("vpn")
            ).to.be.revertedWith("TNS: Not agent owner");
        });
    });

    describe("Resolution", function () {
        beforeEach(async function () {
            await tns.connect(user1).registerName("vpn", 1);
        });

        it("should resolve name to agentId", async function () {
            expect(await tns.resolveName("vpn")).to.equal(1);
        });

        it("should reverse resolve agentId to name", async function () {
            expect(await tns.reverseResolve(1)).to.equal("vpn");
        });

        it("should resolve name to owner address", async function () {
            expect(await tns.resolveOwner("vpn")).to.equal(user1.address);
        });

        it("should check name availability", async function () {
            expect(await tns.isNameAvailable("vpn")).to.equal(false);
            expect(await tns.isNameAvailable("unused")).to.equal(true);
        });

        it("should return 0 for unregistered name", async function () {
            expect(await tns.resolveName("nonexistent")).to.equal(0);
        });
    });
});
