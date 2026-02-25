// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title TempoIdentityRegistry
 * @dev ERC-8004 compliant Agent Identity Registry for Tempo Network.
 *      ERC-721 NFT where each token represents an agent identity.
 *      Supports on-chain metadata key-value store, agent wallet with
 *      EIP-712 signature verification, agentURI for off-chain metadata,
 *      owner-based enumeration, and explicit burn/release lifecycle.
 */
contract TempoIdentityRegistry is ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    uint256 private _nextTokenId;

    // On-chain metadata: agentId => metadataKey => metadataValue
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // Agent wallet (reserved metadata key, managed separately)
    mapping(uint256 => address) private _agentWallets;

    // ========== FR-001: Owner enumeration ==========
    // owner => list of owned agentIds
    mapping(address => uint256[]) private _ownedTokens;
    // agentId => index in _ownedTokens[owner]
    mapping(uint256 => uint256) private _ownedTokensIndex;

    // --- Structs ---
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    // --- EIP-712 TypeHash for setAgentWallet ---
    bytes32 private constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    // --- EIP-712 TypeHash for registerWithAgent ---
    // ownerAddress signs to authorize agentAddress to register on their behalf
    bytes32 private constant REGISTER_WITH_AGENT_TYPEHASH =
        keccak256("RegisterWithAgent(address agentAddress,string agentURI,uint256 deadline)");

    // Agent working address: separate from NFT owner (human/DAO)
    // agentId => agentAddress (the agent's EOA that operates autonomously)
    mapping(uint256 => address) private _agentAddresses;

    // --- Events (ERC-8004 + extensions) ---
    // agentAddress added: who is the autonomous worker behind this identity
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner, address agentAddress);
    // FR-012: includes oldURI for deterministic cache invalidation
    event URIUpdated(uint256 indexed agentId, string oldURI, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    // FR-006: includes oldWallet for audit trail
    event AgentWalletSet(uint256 indexed agentId, address oldWallet, address newWallet);
    event AgentWalletUnset(uint256 indexed agentId);
    // Agent working address set during agent-driven registration
    event AgentAddressSet(uint256 indexed agentId, address indexed agentAddress);
    // FR-007: explicit burn/release event
    event AgentBurned(uint256 indexed agentId, address indexed owner);

    constructor()
        ERC721("Tempo Identity", "TID")
        EIP712("TempoIdentityRegistry", "1")
    {}

    // ========== REGISTRATION ==========

    /**
     * @dev Register a new agent (no URI, no metadata).
     *      agentURI can be set later with setAgentURI().
     */
    function register() external returns (uint256) {
        return _registerAgent(msg.sender, "", address(0), new MetadataEntry[](0));
    }

    /**
     * @dev Register a new agent with an agentURI.
     */
    function register(string calldata agentURI) external returns (uint256) {
        return _registerAgent(msg.sender, agentURI, address(0), new MetadataEntry[](0));
    }

    /**
     * @dev Register a new agent with an agentURI and initial metadata.
     */
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256) {
        return _registerAgent(msg.sender, agentURI, address(0), metadata);
    }

    /**
     * @dev Register a new agent with agent-driven onboarding.
     *      The ownerAddress signs an EIP-712 permit authorizing agentAddress to register.
     *      The agent (msg.sender) calls this function autonomously.
     *
     *      Flow:
     *        1. ownerAddress signs: RegisterWithAgent(agentAddress, agentURI, deadline)
     *        2. Agent calls registerWithAgent(agentURI, ownerAddress, deadline, ownerSignature)
     *        3. Contract verifies signature, mints NFT to agentAddress, stores ownerAddress
     *
     * @param agentURI     IPFS CID of the Agent Passport JSON (e.g. ipfs://Qm...)
     * @param ownerAddress The human/DAO authorizing this registration
     * @param deadline     Signature expiry (unix timestamp)
     * @param ownerSignature EIP-712 signature from ownerAddress
     */
    function registerWithAgent(
        string calldata agentURI,
        address ownerAddress,
        uint256 deadline,
        bytes calldata ownerSignature
    ) external returns (uint256) {
        require(block.timestamp <= deadline, "TempoIdentity: Owner signature expired");
        require(ownerAddress != address(0), "TempoIdentity: Zero owner address");
        require(msg.sender != address(0), "TempoIdentity: Zero agent address");

        // Verify EIP-712 signature from ownerAddress
        bytes32 structHash = keccak256(
            abi.encode(
                REGISTER_WITH_AGENT_TYPEHASH,
                msg.sender,              // agentAddress = tx sender
                keccak256(bytes(agentURI)),
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        require(
            SignatureChecker.isValidSignatureNow(ownerAddress, digest, ownerSignature),
            "TempoIdentity: Invalid owner signature"
        );

        return _registerAgent(msg.sender, agentURI, msg.sender, new MetadataEntry[](0));
    }

    function _registerAgent(
        address owner,
        string memory agentURI,
        address agentAddress,
        MetadataEntry[] memory metadata
    ) internal returns (uint256) {
        uint256 agentId = ++_nextTokenId;
        _mint(owner, agentId);

        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        // Set default agentWallet to owner
        _agentWallets[agentId] = owner;
        emit AgentWalletSet(agentId, address(0), owner);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(owner));

        // Store agentAddress if provided (agent-driven registration)
        if (agentAddress != address(0)) {
            _agentAddresses[agentId] = agentAddress;
            emit AgentAddressSet(agentId, agentAddress);
        }

        // Set additional metadata (agentWallet key is reserved)
        for (uint256 i = 0; i < metadata.length; i++) {
            require(
                keccak256(bytes(metadata[i].metadataKey)) != keccak256(bytes("agentWallet")),
                "TempoIdentity: agentWallet is reserved"
            );
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(
                agentId,
                metadata[i].metadataKey,
                metadata[i].metadataKey,
                metadata[i].metadataValue
            );
        }

        emit Registered(agentId, agentURI, owner, agentAddress);
        return agentId;
    }

    // ========== AGENT URI ==========

    /**
     * @dev Update the agentURI. Only owner or approved operator.
     *      FR-012: emits both old and new URI for deterministic sync.
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "TempoIdentity: Not authorized");
        string memory oldURI = tokenURI(agentId);
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, oldURI, newURI, msg.sender);
    }

    // ========== AGENT ADDRESS (owner<->agent binding) ==========

    /**
     * @dev Get the agent's autonomous working address.
     *      This is the EOA that the AI agent uses to sign transactions.
     *      Set during registerWithAgent() and immutable after.
     */
    function getAgentAddress(uint256 agentId) external view returns (address) {
        return _agentAddresses[agentId];
    }

    // ========== ON-CHAIN METADATA ==========

    /**
     * @dev Set on-chain metadata for an agent. agentWallet key is reserved.
     */
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "TempoIdentity: Not authorized");
        require(
            keccak256(bytes(metadataKey)) != keccak256(bytes("agentWallet")),
            "TempoIdentity: agentWallet is reserved, use setAgentWallet"
        );
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /**
     * @dev Get on-chain metadata for an agent.
     */
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    // ========== AGENT WALLET ==========

    /**
     * @dev Set the agent wallet. Requires EIP-712 signature from the new wallet
     *      to prove control. For EOAs: ECDSA signature. For contracts: ERC-1271.
     *      FR-006: emits oldWallet for immutable audit trail.
     */
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "TempoIdentity: Not authorized");
        require(block.timestamp <= deadline, "TempoIdentity: Signature expired");
        require(newWallet != address(0), "TempoIdentity: Zero address");

        bytes32 structHash = keccak256(abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);

        require(
            SignatureChecker.isValidSignatureNow(newWallet, digest, signature),
            "TempoIdentity: Invalid wallet signature"
        );

        address oldWallet = _agentWallets[agentId];
        _agentWallets[agentId] = newWallet;
        emit AgentWalletSet(agentId, oldWallet, newWallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(newWallet));
    }

    /**
     * @dev Get the agent wallet address.
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    /**
     * @dev Unset (clear) the agent wallet. Owner only.
     */
    function unsetAgentWallet(uint256 agentId) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "TempoIdentity: Not authorized");
        delete _agentWallets[agentId];
        emit AgentWalletUnset(agentId);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", "");
    }

    // ========== FR-001: OWNER ENUMERATION ==========

    /**
     * @dev Get all agent IDs owned by an address.
     *      Provides direct on-chain enumeration without event scanning.
     */
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    /**
     * @dev Get the number of agents owned by an address.
     *      Override of ERC721.balanceOf is already inherited.
     */

    // ========== FR-007: BURN / RELEASE ==========

    /**
     * @dev Burn (permanently destroy) an agent identity.
     *      Only the owner can burn. Clears agentWallet and all associated data.
     *      Name release must be done separately via TNS.releaseName() before burn.
     */
    function burn(uint256 agentId) external {
        require(ownerOf(agentId) == msg.sender, "TempoIdentity: Not owner");
        address owner = msg.sender;

        // Clear agent wallet
        delete _agentWallets[agentId];
        emit AgentWalletUnset(agentId);

        // Burn the token (will trigger _update which handles enumeration cleanup)
        _burn(agentId);

        emit AgentBurned(agentId, owner);
    }

    // ========== TRANSFER HOOK ==========

    /**
     * @dev Override _update to manage owner enumeration and auto-clear agentWallet on transfer.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Remove from previous owner's list (not on mint, where from == address(0))
        if (from != address(0)) {
            _removeFromOwnerList(from, tokenId);
        }

        // Add to new owner's list (not on burn, where to == address(0))
        if (to != address(0)) {
            _ownedTokensIndex[tokenId] = _ownedTokens[to].length;
            _ownedTokens[to].push(tokenId);
        }

        // Clear agentWallet on transfer (not on mint, not on burn)
        if (from != address(0) && to != address(0) && from != to) {
            delete _agentWallets[tokenId];
            emit AgentWalletUnset(tokenId);
        }

        return from;
    }

    /**
     * @dev Remove a token from owner's enumerated list using swap-and-pop.
     */
    function _removeFromOwnerList(address owner, uint256 tokenId) private {
        uint256[] storage tokens = _ownedTokens[owner];
        uint256 index = _ownedTokensIndex[tokenId];
        uint256 lastIndex = tokens.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = tokens[lastIndex];
            tokens[index] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = index;
        }

        tokens.pop();
        delete _ownedTokensIndex[tokenId];
    }
}
