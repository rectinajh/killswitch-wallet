// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SessionPolicy.sol";

contract SessionPolicyTest is Test {
    SessionPolicy public policy;
    address public owner;
    address public agent;
    address public merchant1;
    address public merchant2;
    address public unauthorizedMerchant;
    address public stranger;

    event PaymentExecuted(
        uint256 indexed sessionId,
        address indexed merchant,
        uint256 amount,
        uint256 fee,
        bytes32 receiptId
    );

    event PaymentDenied(
        uint256 indexed sessionId,
        address indexed merchant,
        uint256 amount,
        string reason
    );

    event SessionGranted(
        uint256 indexed sessionId,
        address indexed owner,
        address indexed agent,
        uint256 budget,
        uint256 deadline,
        address[] merchants
    );

    function setUp() public {
        policy = new SessionPolicy();
        owner = address(this);
        agent = makeAddr("agent");
        merchant1 = makeAddr("merchant1");
        merchant2 = makeAddr("merchant2");
        unauthorizedMerchant = makeAddr("unauthorized");
        stranger = makeAddr("stranger");
        // Fund agent for gas
        vm.deal(agent, 1 ether);
    }

    function _merchants1() internal view returns (address[] memory merchants) {
        merchants = new address[](1);
        merchants[0] = merchant1;
    }

    function _merchants2() internal view returns (address[] memory merchants) {
        merchants = new address[](2);
        merchants[0] = merchant1;
        merchants[1] = merchant2;
    }

    function testGrantSession() public {
        address[] memory merchants = _merchants2();

        vm.expectEmit(true, true, true, false);
        emit SessionGranted(0, owner, agent, 1 ether, 0, merchants);

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        (
            address sessionOwner,
            address sessionAgent,
            uint256 budget,
            uint256 spent,
            uint256 deadline,
            ,
            bool frozen,
            bool active
        ) = policy.getSessionPolicy(sessionId);

        assertEq(sessionOwner, owner);
        assertEq(sessionAgent, agent);
        assertEq(budget, 1 ether);
        assertEq(spent, 0);
        assertGt(deadline, block.timestamp);
        assertFalse(frozen);
        assertTrue(active);
        assertTrue(policy.checkMerchant(sessionId, merchant1));
        assertTrue(policy.checkMerchant(sessionId, merchant2));
        assertFalse(policy.checkMerchant(sessionId, unauthorizedMerchant));
    }

    function testSuccessfulPayment() public {
        address[] memory merchants = _merchants1();

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        uint256 merchantBalanceBefore = merchant1.balance;

        vm.expectEmit(true, true, false, false);
        emit PaymentExecuted(sessionId, merchant1, 0.1 ether, 0, bytes32(0));

        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Coffee purchase");

        uint256 merchantBalanceAfter = merchant1.balance;
        assertEq(merchantBalanceAfter - merchantBalanceBefore, 0.1 ether);

        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0.102 ether); // 0.1 + 2% fee

        (, , , , uint256 feesAccrued, , , ) = policy.sessions(sessionId);
        assertEq(feesAccrued, 0.002 ether);
    }

    function testPaymentDenied_MerchantNotAllowed() public {
        address[] memory merchants = _merchants1();

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        vm.expectEmit(true, true, false, true);
        emit PaymentDenied(sessionId, unauthorizedMerchant, 0.1 ether, "Merchant not allowed");

        vm.prank(agent);
        policy.proposeOrPay(
            sessionId,
            unauthorizedMerchant,
            0.1 ether,
            "Unauthorized purchase"
        );

        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0);
    }

    function testPaymentDenied_BudgetExceeded() public {
        address[] memory merchants = _merchants1();

        uint256 budget = 0.1 ether;
        uint256 sessionId = policy.grantSession{value: budget}(
            budget,
            3600,
            agent,
            merchants
        );

        vm.expectEmit(true, true, false, true);
        emit PaymentDenied(sessionId, merchant1, 0.099 ether, "Insufficient budget");

        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, 0.099 ether, "Exceeds budget");

        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0);
    }

    function testPaymentDenied_DeadlineExpired() public {
        address[] memory merchants = _merchants1();

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        vm.warp(block.timestamp + 3601);

        vm.expectEmit(true, true, false, true);
        emit PaymentDenied(sessionId, merchant1, 0.1 ether, "Deadline expired");

        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Late payment");

        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0);
    }

    function testProposeOrPay_UnauthorizedAgent() public {
        address[] memory merchants = _merchants1();

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        vm.prank(stranger);
        vm.expectRevert(SessionPolicy.Unauthorized.selector);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Not the agent");

        vm.expectRevert(SessionPolicy.Unauthorized.selector);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Owner cannot propose");
    }

    function testFreezeSession() public {
        address[] memory merchants = _merchants1();

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            agent,
            merchants
        );

        policy.freeze(sessionId);

        (, , , , , , bool frozen, ) = policy.getSessionPolicy(sessionId);
        assertTrue(frozen);

        vm.prank(agent);
        vm.expectRevert(SessionPolicy.SessionIsFrozen.selector);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "After freeze");
    }

    function testCloseSession_RefundIncludesFees() public {
        address[] memory merchants = _merchants1();

        uint256 budget = 1 ether;
        uint256 sessionId = policy.grantSession{value: budget}(
            budget,
            3600,
            agent,
            merchants
        );

        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Purchase");

        uint256 ownerBalanceBefore = owner.balance;
        policy.closeSession(sessionId);
        uint256 ownerBalanceAfter = owner.balance;

        (, , , , , , , bool active) = policy.getSessionPolicy(sessionId);
        assertFalse(active);

        uint256 expectedReturn = 0.9 ether;
        assertEq(ownerBalanceAfter - ownerBalanceBefore, expectedReturn);
    }

    receive() external payable {}
}
