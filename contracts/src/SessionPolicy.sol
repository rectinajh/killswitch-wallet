// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SessionPolicy
 * @notice Core policy enforcement for KillSwitch Wallet
 * @dev Agent proposes; contract disposes. Boundaries enforced on-chain, not by trusting the model.
 */
contract SessionPolicy {
    struct Session {
        address owner;
        uint256 budget;
        uint256 spent;
        uint256 deadline;
        address[] merchantAllowlist;
        bool frozen;
        bool active;
    }

    uint256 public nextSessionId;
    mapping(uint256 => Session) public sessions;
    mapping(uint256 => mapping(address => bool)) public isMerchantAllowed;

    event SessionGranted(
        uint256 indexed sessionId,
        address indexed owner,
        uint256 budget,
        uint256 deadline,
        address[] merchants
    );

    event PaymentProposed(
        uint256 indexed sessionId,
        address indexed merchant,
        uint256 amount,
        string description
    );

    event PaymentExecuted(
        uint256 indexed sessionId,
        address indexed merchant,
        uint256 amount,
        uint256 fee,
        bytes32 txHash
    );

    event PaymentDenied(
        uint256 indexed sessionId,
        address indexed merchant,
        uint256 amount,
        string reason
    );

    event SessionFrozen(uint256 indexed sessionId, address indexed by);
    event SessionClosed(uint256 indexed sessionId);

    error Unauthorized();
    error SessionNotActive();
    error SessionIsFrozen();
    error InsufficientBudget();
    error MerchantNotAllowed();
    error DeadlineExpired();
    error InvalidParameters();

    modifier onlySessionOwner(uint256 sessionId) {
        if (sessions[sessionId].owner != msg.sender) revert Unauthorized();
        _;
    }

    modifier sessionActive(uint256 sessionId) {
        Session storage s = sessions[sessionId];
        if (!s.active) revert SessionNotActive();
        if (s.frozen) revert SessionIsFrozen();
        if (block.timestamp > s.deadline) revert DeadlineExpired();
        _;
    }

    /**
     * @notice Grant a new spending session with policy boundaries
     * @param budget Maximum wei that can be spent (excluding fees)
     * @param duration Session lifetime in seconds
     * @param merchants Allowlist of merchant addresses
     * @return sessionId The newly created session ID
     */
    function grantSession(
        uint256 budget,
        uint256 duration,
        address[] calldata merchants
    ) external payable returns (uint256 sessionId) {
        if (budget == 0 || duration == 0 || merchants.length == 0) {
            revert InvalidParameters();
        }
        if (msg.value < budget) revert InsufficientBudget();

        sessionId = nextSessionId++;
        Session storage s = sessions[sessionId];
        
        s.owner = msg.sender;
        s.budget = budget;
        s.spent = 0;
        s.deadline = block.timestamp + duration;
        s.merchantAllowlist = merchants;
        s.frozen = false;
        s.active = true;

        for (uint256 i = 0; i < merchants.length; i++) {
            isMerchantAllowed[sessionId][merchants[i]] = true;
        }

        emit SessionGranted(sessionId, msg.sender, budget, s.deadline, merchants);
    }

    /**
     * @notice Agent proposes a payment; contract checks policy and executes or denies
     * @param sessionId The session to spend from
     * @param merchant The recipient address
     * @param amount Payment amount in wei
     * @param description Human-readable payment description
     */
    function proposeOrPay(
        uint256 sessionId,
        address merchant,
        uint256 amount,
        string calldata description
    ) external sessionActive(sessionId) {
        Session storage s = sessions[sessionId];

        emit PaymentProposed(sessionId, merchant, amount, description);

        if (!isMerchantAllowed[sessionId][merchant]) {
            emit PaymentDenied(sessionId, merchant, amount, "Merchant not allowed");
            return;
        }

        uint256 fee = (amount * 2) / 100; // 2% fee simulation
        uint256 totalCost = amount + fee;

        if (s.spent + totalCost > s.budget) {
            emit PaymentDenied(sessionId, merchant, amount, "Insufficient budget");
            return;
        }

        if (block.timestamp > s.deadline) {
            emit PaymentDenied(sessionId, merchant, amount, "Deadline expired");
            return;
        }

        s.spent += totalCost;

        (bool success, ) = merchant.call{value: amount}("");
        require(success, "Transfer failed");

        bytes32 txHash = keccak256(
            abi.encodePacked(sessionId, merchant, amount, block.timestamp)
        );

        emit PaymentExecuted(sessionId, merchant, amount, fee, txHash);
    }

    /**
     * @notice Emergency stop: freeze session to prevent further spending
     * @param sessionId The session to freeze
     */
    function freeze(uint256 sessionId) external onlySessionOwner(sessionId) {
        sessions[sessionId].frozen = true;
        emit SessionFrozen(sessionId, msg.sender);
    }

    /**
     * @notice Close session and return remaining budget to owner
     * @param sessionId The session to close
     */
    function closeSession(uint256 sessionId) 
        external 
        onlySessionOwner(sessionId) 
    {
        Session storage s = sessions[sessionId];
        require(s.active, "Session not active");

        s.active = false;
        uint256 remaining = s.budget - s.spent;

        if (remaining > 0) {
            (bool success, ) = s.owner.call{value: remaining}("");
            require(success, "Refund failed");
        }

        emit SessionClosed(sessionId);
    }

    /**
     * @notice Query remaining budget for a session
     */
    function getRemainingBudget(uint256 sessionId) 
        external 
        view 
        returns (uint256) 
    {
        Session storage s = sessions[sessionId];
        if (s.spent >= s.budget) return 0;
        return s.budget - s.spent;
    }

    /**
     * @notice Query session policy details
     */
    function getSessionPolicy(uint256 sessionId)
        external
        view
        returns (
            address owner,
            uint256 budget,
            uint256 spent,
            uint256 deadline,
            address[] memory merchants,
            bool frozen,
            bool active
        )
    {
        Session storage s = sessions[sessionId];
        return (
            s.owner,
            s.budget,
            s.spent,
            s.deadline,
            s.merchantAllowlist,
            s.frozen,
            s.active
        );
    }

    /**
     * @notice Check if merchant is allowed for session
     */
    function checkMerchant(uint256 sessionId, address merchant) 
        external 
        view 
        returns (bool) 
    {
        return isMerchantAllowed[sessionId][merchant];
    }
}
