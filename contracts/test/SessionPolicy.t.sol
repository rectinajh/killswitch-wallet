// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SessionPolicy.sol";

contract SessionPolicyTest is Test {
    SessionPolicy public policy;
    address public owner;
    address public merchant1;
    address public merchant2;
    address public unauthorizedMerchant;

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

    function setUp() public {
        policy = new SessionPolicy();
        owner = address(this);
        merchant1 = makeAddr("merchant1");
        merchant2 = makeAddr("merchant2");
        unauthorizedMerchant = makeAddr("unauthorized");
    }

    function testGrantSession() public {
        address[] memory merchants = new address[](2);
        merchants[0] = merchant1;
        merchants[1] = merchant2;

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600, // 1 hour
            merchants
        );

        (
            address sessionOwner,
            uint256 budget,
            uint256 spent,
            uint256 deadline,
            ,
            bool frozen,
            bool active
        ) = policy.getSessionPolicy(sessionId);

        assertEq(sessionOwner, owner);
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
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            merchants
        );

        uint256 merchantBalanceBefore = merchant1.balance;

        vm.expectEmit(true, true, false, false);
        emit PaymentExecuted(sessionId, merchant1, 0.1 ether, 0, bytes32(0));

        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Coffee purchase");

        uint256 merchantBalanceAfter = merchant1.balance;
        assertEq(merchantBalanceAfter - merchantBalanceBefore, 0.1 ether);

        (, , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0.102 ether); // 0.1 + 2% fee
    }

    function testPaymentDenied_MerchantNotAllowed() public {
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            merchants
        );

        vm.expectEmit(true, true, false, true);
        emit PaymentDenied(sessionId, unauthorizedMerchant, 0.1 ether, "Merchant not allowed");

        policy.proposeOrPay(
            sessionId,
            unauthorizedMerchant,
            0.1 ether,
            "Unauthorized purchase"
        );

        (, , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0); // No spending occurred
    }

    function testPaymentDenied_BudgetExceeded() public {
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 budget = 0.1 ether;
        uint256 sessionId = policy.grantSession{value: budget}(
            budget,
            3600,
            merchants
        );

        vm.expectEmit(true, true, false, true);
        emit PaymentDenied(sessionId, merchant1, 0.099 ether, "Insufficient budget");

        // Try to spend 0.099 ether, but with 2% fee = 0.10098 ether > budget
        policy.proposeOrPay(sessionId, merchant1, 0.099 ether, "Exceeds budget");

        (, , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0); // No spending occurred
    }

    function testPaymentDenied_DeadlineExpired() public {
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            merchants
        );

        vm.warp(block.timestamp + 3601); // Move past deadline

        vm.expectRevert(SessionPolicy.DeadlineExpired.selector);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Late payment");
    }

    function testFreezeSession() public {
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 sessionId = policy.grantSession{value: 1 ether}(
            1 ether,
            3600,
            merchants
        );

        policy.freeze(sessionId);

        (, , , , , bool frozen, ) = policy.getSessionPolicy(sessionId);
        assertTrue(frozen);

        vm.expectRevert(SessionPolicy.SessionIsFrozen.selector);
        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "After freeze");
    }

    function testCloseSession() public {
        address[] memory merchants = new address[](1);
        merchants[0] = merchant1;

        uint256 budget = 1 ether;
        uint256 sessionId = policy.grantSession{value: budget}(
            budget,
            3600,
            merchants
        );

        policy.proposeOrPay(sessionId, merchant1, 0.1 ether, "Purchase");

        uint256 ownerBalanceBefore = owner.balance;
        policy.closeSession(sessionId);
        uint256 ownerBalanceAfter = owner.balance;

        (, , , , , , bool active) = policy.getSessionPolicy(sessionId);
        assertFalse(active);

        // Remaining budget returned (budget - spent)
        uint256 expectedReturn = budget - 0.102 ether; // 0.1 + 2% fee
        assertEq(ownerBalanceAfter - ownerBalanceBefore, expectedReturn);
    }

    receive() external payable {}
}
