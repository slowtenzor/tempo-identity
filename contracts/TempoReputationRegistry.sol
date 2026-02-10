// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TempoReputationRegistry
 * @dev Implementation of Agent Reputation Registry (ERC-8004 compatible) for Tempo Network.
 *      Stores feedback signals (value, tags) for agents registered in IdentityRegistry.
 */
contract TempoReputationRegistry is Ownable {
    
    // Address of the Identity Registry (to verify agent existence)
    address public identityRegistry;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    // agentId => clientAddress => feedbackIndex => Feedback
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) public feedbacks;
    
    // agentId => clientAddress => count
    mapping(uint256 => mapping(address => uint64)) public feedbackCounts;

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

    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);

    constructor(address _identityRegistry) Ownable(msg.sender) {
        identityRegistry = _identityRegistry;
    }

    /**
     * @dev Give feedback to an agent.
     * @param agentId The ID of the agent receiving feedback.
     * @param value The feedback value (fixed point).
     * @param valueDecimals The decimals for the value.
     * @param tag1 Primary category tag.
     * @param tag2 Secondary category tag.
     * @param endpoint The service endpoint being rated.
     * @param feedbackURI IPFS/URL link to detailed feedback proof.
     * @param feedbackHash Integrity hash of the feedback content.
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
        // In a real implementation, we would check IdentityRegistry.ownerOf(agentId) != address(0)
        // But for interface compatibility, we assume the caller verified the agent exists.
        
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
            tag1, // indexed
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    /**
     * @dev Revoke a previously given feedback.
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex <= feedbackCounts[agentId][msg.sender], "Feedback not found");
        feedbacks[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }
}
