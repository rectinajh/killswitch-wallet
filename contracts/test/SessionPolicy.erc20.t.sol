// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SessionPolicy.sol";
import "../src/mocks/MockUSDG.sol";

contract SessionPolicyErc20Test is Test {
    SessionPolicy public policy;
    MockUSDG public usdg;
    address public agent;
    address public merchant1;
    address public unauthorized;

    uint256 constant UNIT = 1e6; // 6 decimals

    function setUp() public {
        policy = new SessionPolicy();
        usdg = new MockUSDG();
        agent = makeAddr("agent");
        merchant1 = makeAddr("merchant1");
        unauthorized = makeAddr("unauthorized");
        vm.deal(agent, 1 ether);
        usdg.mint(address(this), 1000 * UNIT);
        usdg.approve(address(policy), type(uint256).max);
    }

    function _merchants1() internal view returns (address[] memory merchants) {
        merchants = new address[](1);
        merchants[0] = merchant1;
    }

    function testGrantSessionTokenAndPay() public {
        uint256 budget = 2 * UNIT;
        uint256 sessionId = policy.grantSessionToken(
            address(usdg),
            budget,
            3600,
            agent,
            _merchants1()
        );

        assertEq(policy.getSessionToken(sessionId), address(usdg));
        assertEq(usdg.balanceOf(address(policy)), budget);

        uint256 pay = 5 * UNIT / 10; // 0.5
        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, pay, "Coffee USDC");

        assertEq(usdg.balanceOf(merchant1), pay);
        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, pay + (pay * 2) / 100); // 0.51
        assertEq(usdg.balanceOf(address(policy)), budget - pay);
    }

    function testTokenDenyDoesNotMoveFunds() public {
        uint256 budget = 2 * UNIT;
        uint256 sessionId = policy.grantSessionToken(
            address(usdg),
            budget,
            3600,
            agent,
            _merchants1()
        );

        vm.prank(agent);
        policy.proposeOrPay(sessionId, unauthorized, UNIT / 10, "Shadow");

        assertEq(usdg.balanceOf(unauthorized), 0);
        assertEq(usdg.balanceOf(address(policy)), budget);
        (, , , uint256 spent, , , , ) = policy.getSessionPolicy(sessionId);
        assertEq(spent, 0);
    }

    function testTokenCloseRefundsFees() public {
        uint256 budget = 2 * UNIT;
        uint256 sessionId = policy.grantSessionToken(
            address(usdg),
            budget,
            3600,
            agent,
            _merchants1()
        );

        uint256 pay = 5 * UNIT / 10;
        vm.prank(agent);
        policy.proposeOrPay(sessionId, merchant1, pay, "Coffee");

        uint256 before = usdg.balanceOf(address(this));
        policy.closeSession(sessionId);
        uint256 afterBal = usdg.balanceOf(address(this));

        // merchant got 0.5; contract returns leftover 1.5 + 0.01 fee = 1.51
        assertEq(afterBal - before, budget - pay);
        assertEq(usdg.balanceOf(address(policy)), 0);
    }

    function testGrantSessionTokenRejectsZeroToken() public {
        vm.expectRevert(SessionPolicy.InvalidParameters.selector);
        policy.grantSessionToken(address(0), UNIT, 3600, agent, _merchants1());
    }

    function testEthGrantTokenIsZero() public {
        uint256 sessionId = policy.grantSession{value: 1 ether}(1 ether, 3600, agent, _merchants1());
        assertEq(policy.getSessionToken(sessionId), address(0));
    }
}
