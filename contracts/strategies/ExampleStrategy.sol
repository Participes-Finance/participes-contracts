// SPDX-License-Identifier: MIT
pragma solidity ^0.6.7;

import "./StrategyGeneralMasterChefBase.sol";
import "../interfaces/IMasterChefJoe.sol";

contract ExampleStrategy is StrategyGeneralMasterChefBase {
    // Token addresses

    constructor(
      address _token,
      address _masterChef,
      address _depositor,
      address _lp,
      uint256 _pid
    )
      public
      StrategyGeneralMasterChefBase(
        _token,
        _masterChef,
        _pid, // pool id
        _lp,
        _depositor
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