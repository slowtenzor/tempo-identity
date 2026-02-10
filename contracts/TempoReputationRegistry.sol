// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title TempoReputationRegistry
 * @dev ERC-8004 compliant Reputation Registry for Tempo Network.
 *      Stores feedback signals from clients to agents, with append-response
 *      mechanism and comprehensive read functions.
 */
contract TempoReputationRegistry {

    address public identityRegistry;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    struct Response {
        address responder;
        bytes32 responseHash;
    }

    // agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) public feedbacks;

    // agentId => clientAddress => count
    mapping(uint256 => mapping(address => uint64)) public feedbackCounts;

    // agentId => list of unique clients
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _isClient;

    // agentId => clientAddress => feedbackIndex => responses count
    mapping(uint256 => mapping(address => mapping(uint64 => uint64))) private _responseCounts;

    // agentId => clientAddress => feedbackIndex => responder => responded
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => bool)))) private _hasResponded;

    // --- Events (ERC-8004) ---
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 indexed feedbackIndex
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "ReputationRegistry: Zero address");
        identityRegistry = _identityRegistry;
    }

    /**
     * @dev Get the identity registry address.
     */
    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }

    // ========== GIVE FEEDBACK ==========

    /**
     * @dev Give feedback to an agent.
     *      The submitter MUST NOT be the agent owner or approved operator.
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "ReputationRegistry: valueDecimals must be 0-18");

        // Verify agent exists and submitter is not the owner
        IERC721 identity = IERC721(identityRegistry);
        address agentOwner = identity.ownerOf(agentId);
        require(agentOwner != address(0), "ReputationRegistry: Agent does not exist");
        require(msg.sender != agentOwner, "ReputationRegistry: Cannot review own agent");
        require(
            !identity.isApprovedForAll(agentOwner, msg.sender) &&
            identity.getApproved(agentId) != msg.sender,
            "ReputationRegistry: Operator cannot review agent"
        );

        // Track client
        if (!_isClient[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _isClient[agentId][msg.sender] = true;
        }

        uint64 index = ++feedbackCounts[agentId][msg.sender];

        feedbacks[agentId][msg.sender][index] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        emit NewFeedback(
            agentId,
            msg.sender,
            index,
            value,
            valueDecimals,
            tag1,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    // ========== REVOKE FEEDBACK ==========

    /**
     * @dev Revoke a previously given feedback. Only the original client.
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0 && feedbackIndex <= feedbackCounts[agentId][msg.sender], "ReputationRegistry: Feedback not found");
        require(!feedbacks[agentId][msg.sender][feedbackIndex].isRevoked, "ReputationRegistry: Already revoked");
        feedbacks[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    // ========== APPEND RESPONSE ==========

    /**
     * @dev Append a response to a feedback. Anyone can respond.
     */
    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex > 0 && feedbackIndex <= feedbackCounts[agentId][clientAddress], "ReputationRegistry: Feedback not found");

        _responseCounts[agentId][clientAddress][feedbackIndex]++;
        _hasResponded[agentId][clientAddress][feedbackIndex][msg.sender] = true;

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    // ========== READ FUNCTIONS ==========

    /**
     * @dev Get summary of feedback for an agent, filtered by clients and optional tags.
     *      clientAddresses MUST be provided (non-empty) to mitigate Sybil attacks.
     */
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        require(clientAddresses.length > 0, "ReputationRegistry: clientAddresses required");

        int256 totalValue;
        bool hasTag1Filter = bytes(tag1).length > 0;
        bool hasTag2Filter = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address client = clientAddresses[i];
            uint64 lastIdx = feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = feedbacks[agentId][client][j];
                if (fb.isRevoked) continue;

                if (hasTag1Filter && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (hasTag2Filter && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;

                totalValue += int256(fb.value);
                count++;
            }
        }

        if (count > 0) {
            summaryValue = int128(totalValue / int256(int64(count)));
        }
        summaryValueDecimals = 0;
    }

    /**
     * @dev Read a single feedback entry.
     */
    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked) {
        Feedback storage fb = feedbacks[agentId][clientAddress][feedbackIndex];
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    /**
     * @dev Read all feedback for an agent, with optional filters.
     */
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) external view returns (
        address[] memory clients,
        uint64[] memory feedbackIndexes,
        int128[] memory values,
        uint8[] memory valueDecimals,
        string[] memory tag1s,
        string[] memory tag2s,
        bool[] memory revokedStatuses
    ) {
        // First pass: count matching entries
        uint256 total = _countMatchingFeedback(agentId, clientAddresses, tag1, tag2, includeRevoked);

        // Allocate arrays
        clients = new address[](total);
        feedbackIndexes = new uint64[](total);
        values = new int128[](total);
        valueDecimals = new uint8[](total);
        tag1s = new string[](total);
        tag2s = new string[](total);
        revokedStatuses = new bool[](total);

        // Second pass: populate
        uint256 idx;
        uint256 clientCount;
        if (clientAddresses.length > 0) {
            clientCount = clientAddresses.length;
        } else {
            clientCount = _clients[agentId].length;
        }
        bool hasTag1Filter = bytes(tag1).length > 0;
        bool hasTag2Filter = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clientCount; i++) {
            address client = clientAddresses.length > 0 ? clientAddresses[i] : _clients[agentId][i];
            uint64 lastIdx = feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = feedbacks[agentId][client][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (hasTag1Filter && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (hasTag2Filter && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;

                clients[idx] = client;
                feedbackIndexes[idx] = j;
                values[idx] = fb.value;
                valueDecimals[idx] = fb.valueDecimals;
                tag1s[idx] = fb.tag1;
                tag2s[idx] = fb.tag2;
                revokedStatuses[idx] = fb.isRevoked;
                idx++;
            }
        }
    }

    function _countMatchingFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    ) internal view returns (uint256 total) {
        uint256 clientCount;
        if (clientAddresses.length > 0) {
            clientCount = clientAddresses.length;
        } else {
            clientCount = _clients[agentId].length;
        }
        bool hasTag1Filter = bytes(tag1).length > 0;
        bool hasTag2Filter = bytes(tag2).length > 0;

        for (uint256 i = 0; i < clientCount; i++) {
            address client = clientAddresses.length > 0 ? clientAddresses[i] : _clients[agentId][i];
            uint64 lastIdx = feedbackCounts[agentId][client];

            for (uint64 j = 1; j <= lastIdx; j++) {
                Feedback storage fb = feedbacks[agentId][client][j];
                if (!includeRevoked && fb.isRevoked) continue;
                if (hasTag1Filter && keccak256(bytes(fb.tag1)) != keccak256(bytes(tag1))) continue;
                if (hasTag2Filter && keccak256(bytes(fb.tag2)) != keccak256(bytes(tag2))) continue;
                total++;
            }
        }
    }

    /**
     * @dev Get all unique clients that have given feedback to an agent.
     */
    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    /**
     * @dev Get the last feedback index for a client on a specific agent.
     */
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return feedbackCounts[agentId][clientAddress];
    }

    /**
     * @dev Get the response count for a specific feedback entry.
     *      Optional filter by responders array.
     */
    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        if (responders.length == 0) {
            return _responseCounts[agentId][clientAddress][feedbackIndex];
        }
        for (uint256 i = 0; i < responders.length; i++) {
            if (_hasResponded[agentId][clientAddress][feedbackIndex][responders[i]]) {
                count++;
            }
        }
    }
}
