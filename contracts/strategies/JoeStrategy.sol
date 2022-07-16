// SPDX-License-Identifier: MIT
pragma solidity ^0.6.7;

import "./StrategyGeneralMasterChefBase.sol";
import "../interfaces/IMasterChefJoe.sol";

contract JoeStrategy is StrategyGeneralMasterChefBase {
    // Token addresses
    address public joe = 0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd;
    address public masterChef = 0x188bED1968b795d5c9022F6a0bb5931Ac4c18F00; // MCJv3 address

    constructor(
      address depositor,
      address lp,
      address token0,
      address token1,
      uint256 pid
    )
      public
      StrategyGeneralMasterChefBase(
        joe,
        masterChef,
        token0,
        token1,
        pid, // pool id
        lp,
        depositor
      )
    {}

    function getHarvestable() external override view returns (uint256) {
        uint256 _pendingReward;
        address a;
        string memory b;
        uint256 c;
        (_pendingReward, a, b, c) = IMasterChefJoe(masterchef).pendingTokens(poolId, address(this));
        
        return _pendingReward;
    }
}