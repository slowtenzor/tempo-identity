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
 *      EIP-712 signature verification, and agentURI for off-chain metadata.
 */
contract TempoIdentityRegistry is ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    uint256 private _nextTokenId;

    // On-chain metadata: agentId => metadataKey => metadataValue
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // Agent wallet (reserved metadata key, managed separately)
    mapping(uint256 => address) private _agentWallets;

    // --- Structs ---
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    // --- EIP-712 TypeHash for setAgentWallet ---
    bytes32 private constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    // --- Events (ERC-8004) ---
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );
    event AgentWalletSet(uint256 indexed agentId, address wallet);
    event AgentWalletUnset(uint256 indexed agentId);

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
        return _registerAgent(msg.sender, "", new MetadataEntry[](0));
    }

    /**
     * @dev Register a new agent with an agentURI.
     */
    function register(string calldata agentURI) external returns (uint256) {
        return _registerAgent(msg.sender, agentURI, new MetadataEntry[](0));
    }

    /**
     * @dev Register a new agent with an agentURI and initial metadata.
     */
    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256) {
        return _registerAgent(msg.sender, agentURI, metadata);
    }

    function _registerAgent(
        address owner,
        string memory agentURI,
        MetadataEntry[] memory metadata
    ) internal returns (uint256) {
        uint256 agentId = ++_nextTokenId;
        _mint(owner, agentId);

        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        // Set default agentWallet to owner
        _agentWallets[agentId] = owner;
        emit AgentWalletSet(agentId, owner);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(owner));

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

        emit Registered(agentId, agentURI, owner);
        return agentId;
    }

    // ========== AGENT URI ==========

    /**
     * @dev Update the agentURI. Only owner or approved operator.
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(_isAuthorized(ownerOf(agentId), msg.sender, agentId), "TempoIdentity: Not authorized");
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
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

        _agentWallets[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet);
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

    // ========== TRANSFER HOOK ==========

    /**
     * @dev Override _update to auto-clear agentWallet on transfer.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Clear agentWallet on transfer (not on mint)
        if (from != address(0) && to != address(0) && from != to) {
            delete _agentWallets[tokenId];
            emit AgentWalletUnset(tokenId);
        }

        return from;
    }
}
