// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TempoIdentityRegistry
 * @dev Implementation of Agent Identity Registry (ERC-8004 compatible) for Tempo Network.
 *      Combines NFT-based identity with unique name resolution (*.tempo).
 */
contract TempoIdentityRegistry is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // Mapping from name (e.g. "vpn") to agentId (tokenId)
    mapping(string => uint256) public nameToAgentId;
    
    // Mapping from agentId to name
    mapping(uint256 => string) public agentIdToName;

    // Optional: Agent wallet for payments (ERC-8004 spec)
    mapping(uint256 => address) private _agentWallets;

    event AgentRegistered(uint256 indexed agentId, string name, address indexed owner, string agentURI);
    event AgentWalletSet(uint256 indexed agentId, address wallet);

    constructor() ERC721("Tempo Identity", "TID") Ownable(msg.sender) {}

    /**
     * @dev Register a new agent with a unique name.
     * @param name The unique handle (e.g. "vpn" for "vpn.tempo").
     * @param agentURI The metadata URI (ERC-8004 Registration File).
     */
    function register(string memory name, string memory agentURI) external returns (uint256) {
        require(nameToAgentId[name] == 0, "TempoIdentity: Name already taken");
        require(bytes(name).length > 0, "TempoIdentity: Name cannot be empty");

        uint256 agentId = ++_nextTokenId;
        _mint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);

        nameToAgentId[name] = agentId;
        agentIdToName[agentId] = name;

        // Default agent wallet is owner
        _agentWallets[agentId] = msg.sender;

        emit AgentRegistered(agentId, name, msg.sender, agentURI);
        return agentId;
    }

    /**
     * @dev Update the metadata URI (ERC-8004 spec).
     */
    function setAgentURI(uint256 agentId, string memory newURI) external {
        require(ownerOf(agentId) == msg.sender, "TempoIdentity: Not owner");
        _setTokenURI(agentId, newURI);
    }

    /**
     * @dev Set the payment wallet for the agent (ERC-8004 spec).
     */
    function setAgentWallet(uint256 agentId, address newWallet) external {
        require(ownerOf(agentId) == msg.sender, "TempoIdentity: Not owner");
        _agentWallets[agentId] = newWallet;
        emit AgentWalletSet(agentId, newWallet);
    }

    /**
     * @dev Get the payment wallet (ERC-8004 spec).
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    /**
     * @dev Resolve a name to an agent ID.
     */
    function resolveId(string memory name) external view returns (uint256) {
        return nameToAgentId[name];
    }

    /**
     * @dev Resolve a name to the agent's metadata URI.
     */
    function resolveURI(string memory name) external view returns (string memory) {
        uint256 agentId = nameToAgentId[name];
        require(agentId != 0, "TempoIdentity: Name not found");
        return tokenURI(agentId);
    }
}
