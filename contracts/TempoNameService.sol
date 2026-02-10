// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title TempoNameService (TNS)
 * @dev ENS-style name resolver for Tempo Identity Registry.
 *      Maps human-readable names (e.g. "vpn" for "vpn.tempo") to agentIds
 *      in the TempoIdentityRegistry. Separate from ERC-8004 standard.
 */
contract TempoNameService {

    address public identityRegistry;

    // name => agentId (0 = not registered)
    mapping(string => uint256) public nameToAgentId;

    // agentId => name (primary name, for reverse resolution)
    mapping(uint256 => string) public agentIdToName;

    // Track if agentId has a name assigned
    mapping(uint256 => bool) private _hasName;

    event NameRegistered(string indexed indexedName, string name, uint256 indexed agentId, address indexed owner);
    event NameReleased(string indexed indexedName, string name, uint256 indexed agentId);

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "TNS: Zero address");
        identityRegistry = _identityRegistry;
    }

    /**
     * @dev Register a name for an agent. Only the agent owner can register.
     *      Each name must be unique. Each agent can have at most one name.
     */
    function registerName(string calldata name, uint256 agentId) external {
        require(bytes(name).length > 0, "TNS: Name cannot be empty");
        require(bytes(name).length <= 64, "TNS: Name too long");
        require(nameToAgentId[name] == 0, "TNS: Name already taken");
        require(!_hasName[agentId], "TNS: Agent already has a name");

        IERC721 identity = IERC721(identityRegistry);
        require(identity.ownerOf(agentId) == msg.sender, "TNS: Not agent owner");

        nameToAgentId[name] = agentId;
        agentIdToName[agentId] = name;
        _hasName[agentId] = true;

        emit NameRegistered(name, name, agentId, msg.sender);
    }

    /**
     * @dev Release a name. Only the current agent owner can release.
     */
    function releaseName(string calldata name) external {
        uint256 agentId = nameToAgentId[name];
        require(agentId != 0, "TNS: Name not found");

        IERC721 identity = IERC721(identityRegistry);
        require(identity.ownerOf(agentId) == msg.sender, "TNS: Not agent owner");

        delete nameToAgentId[name];
        delete agentIdToName[agentId];
        _hasName[agentId] = false;

        emit NameReleased(name, name, agentId);
    }

    /**
     * @dev Resolve a name to an agentId.
     */
    function resolveName(string calldata name) external view returns (uint256) {
        return nameToAgentId[name];
    }

    /**
     * @dev Reverse resolve: get the name for an agentId.
     */
    function reverseResolve(uint256 agentId) external view returns (string memory) {
        return agentIdToName[agentId];
    }

    /**
     * @dev Resolve a name directly to the agent owner address.
     */
    function resolveOwner(string calldata name) external view returns (address) {
        uint256 agentId = nameToAgentId[name];
        require(agentId != 0, "TNS: Name not found");
        return IERC721(identityRegistry).ownerOf(agentId);
    }

    /**
     * @dev Check if a name is available.
     */
    function isNameAvailable(string calldata name) external view returns (bool) {
        return nameToAgentId[name] == 0;
    }
}
