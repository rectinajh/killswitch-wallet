// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISessionCapability
 * @notice Capability surface shared by KillSwitch SessionPolicy today and
 *         a future ERC-4337 / Smart Session module tomorrow.
 * @dev Furiosa B demo implements this via SessionPolicy (EOA + eth value escrow).
 *      Production path: wrap the same rules as a Validator/Session Key module
 *      on a Smart Account (see docs/AA_SESSION_KEY.md).
 */
interface ISessionCapability {
    /// @notice Owner-granted session: budget, lifetime, merchant allowlist
    function grantSession(
        uint256 budget,
        uint256 duration,
        address[] calldata merchants
    ) external payable returns (uint256 sessionId);

    /// @notice Agent proposes; contract executes or records denial
    function proposeOrPay(
        uint256 sessionId,
        address merchant,
        uint256 amount,
        string calldata description
    ) external;

    /// @notice Human-in-the-loop emergency stop (no spend)
    function freeze(uint256 sessionId) external;

    /// @notice Close session and refund remaining budget to owner
    function closeSession(uint256 sessionId) external;

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
        );
}
