// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISessionCapability} from "./interfaces/ISessionCapability.sol";

/**
 * @title SessionPolicy
 * @notice Core policy enforcement for KillSwitch Wallet
 * @dev Agent proposes; contract disposes. Boundaries enforced on-chain, not by trusting the model.
 *
 * Session capability binds an `agent` address at grant time. Only that agent may call
 * `proposeOrPay`. Owner retains freeze/close. Deadline denials are recorded via
 * `PaymentDenied` (not a hard revert in the active modifier) so the audit trail is complete.
 */
contract SessionPolicy is ISessionCapability {
    struct Session {
        address owner;
        address agent; // Bound at grant; only this address may proposeOrPay
        uint256 budget; // Max totalCost (amount + 2% fee), NOT amount excluding fees
        uint256 spent; // Cumulative totalCost charged against budget
        uint256 feesAccrued; // Fees retained in-contract (never transferred to merchant)
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
        address indexed agent,
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
        // Content receipt id = keccak256(sessionId, merchant, amount, timestamp).
        // NOT the chain transaction hash — use the ethers/RPC tx hash for explorer links.
        bytes32 receiptId
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

    /// @dev Active + not frozen only. Deadline is checked inside proposeOrPay so expiry is recordable.
    modifier sessionActive(uint256 sessionId) {
        Session storage s = sessions[sessionId];
        if (!s.active) revert SessionNotActive();
        if (s.frozen) revert SessionIsFrozen();
        _;
    }

    /**
     * @notice Grant a new spending session with policy boundaries
     * @param budget Maximum totalCost (amount + 2% fee) that can be charged
     * @param duration Session lifetime in seconds
     * @param agent Address authorized to call proposeOrPay for this session
     * @param merchants Allowlist of merchant addresses
     * @return sessionId The newly created session ID
     */
    function grantSession(
        uint256 budget,
        uint256 duration,
        address agent,
        address[] calldata merchants
    ) external payable returns (uint256 sessionId) {
        if (budget == 0 || duration == 0 || merchants.length == 0 || agent == address(0)) {
            revert InvalidParameters();
        }
        if (msg.value < budget) revert InsufficientBudget();

        sessionId = nextSessionId++;
        Session storage s = sessions[sessionId];

        s.owner = msg.sender;
        s.agent = agent;
        s.budget = budget;
        s.spent = 0;
        s.feesAccrued = 0;
        s.deadline = block.timestamp + duration;
        s.merchantAllowlist = merchants;
        s.frozen = false;
        s.active = true;

        for (uint256 i = 0; i < merchants.length; i++) {
            isMerchantAllowed[sessionId][merchants[i]] = true;
        }

        emit SessionGranted(sessionId, msg.sender, agent, budget, s.deadline, merchants);
    }

    /**
     * @notice Agent proposes a payment; contract checks policy and executes or denies
     * @dev Only the bound session agent may call. Denials (merchant/budget/deadline) emit
     *      PaymentDenied and return — they do not revert after PaymentProposed.
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
        if (msg.sender != s.agent) revert Unauthorized();

        emit PaymentProposed(sessionId, merchant, amount, description);

        if (!isMerchantAllowed[sessionId][merchant]) {
            emit PaymentDenied(sessionId, merchant, amount, "Merchant not allowed");
            return;
        }

        // Fee model: 2% of amount. Budget check uses amount + fee (totalCost).
        // Agent helpers (feeWei / totalCostWei) must stay in sync with this formula.
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
        s.feesAccrued += fee;

        (bool success, ) = merchant.call{value: amount}("");
        require(success, "Transfer failed");

        // Content receipt id — NOT the chain tx hash
        bytes32 receiptId = keccak256(
            abi.encodePacked(sessionId, merchant, amount, block.timestamp)
        );

        emit PaymentExecuted(sessionId, merchant, amount, fee, receiptId);
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
     * @notice Close session and refund leftover principal including accrued fees
     * @dev Refund = budget - spent + feesAccrued. Fees never left the contract, so they
     *      are returned with unused budget. Only amounts paid to merchants left the vault.
     * @param sessionId The session to close
     */
    function closeSession(uint256 sessionId)
        external
        onlySessionOwner(sessionId)
    {
        Session storage s = sessions[sessionId];
        require(s.active, "Session not active");

        s.active = false;
        // leftover principal (budget - spent) + fees that never left the contract
        uint256 refund = s.budget - s.spent + s.feesAccrued;

        if (refund > 0) {
            (bool success, ) = s.owner.call{value: refund}("");
            require(success, "Refund failed");
        }

        emit SessionClosed(sessionId);
    }

    /**
     * @notice Query remaining budget for a session (budget - spent)
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
            address agent,
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
            s.agent,
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
