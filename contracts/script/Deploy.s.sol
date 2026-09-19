// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SessionPolicy.sol";

contract DeployScript is Script {
    function run() external {
        // Prefer OWNER_PRIVATE_KEY; fall back to PRIVATE_KEY for older envs
        uint256 deployerPrivateKey;
        try vm.envUint("OWNER_PRIVATE_KEY") returns (uint256 k) {
            deployerPrivateKey = k;
        } catch {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }

        vm.startBroadcast(deployerPrivateKey);

        SessionPolicy policy = new SessionPolicy();

        console.log("SessionPolicy deployed at:", address(policy));

        vm.stopBroadcast();
    }
}
