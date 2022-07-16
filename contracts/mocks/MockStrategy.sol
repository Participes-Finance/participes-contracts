// SPDX-License-Identifier: MIT
pragma solidity ^0.6.7;

import "../strategies/StrategyBase.sol";
import "../strategies/IMasterChef.sol";
import "../interfaces/IParticipesDepositor.sol";

contract MockStrategy is StrategyBase {
    // Token addresses
    address public masterchef;
    address public rewardToken;

    address public token0;
    address public token1;

    uint256 public poolId;

    constructor(
        address _rewardToken,
        address _masterchef,
        address _token0,
        address _token1,
        uint256 _poolId,
        address _lp,
        address _depositor
    )
        public
        StrategyBase(
            _lp,
            _depositor
        )
    {
        poolId = _poolId;
        token0 = _token0;
        token1 = _token1;
        rewardToken = _rewardToken;
        masterchef = _masterchef;
    }
    
    function balanceOfPool() public override view returns (uint256) {
        (uint256 amount, ) = IMasterChef(masterchef).userInfo(poolId, address(this));
        return amount;
    }

    function getHarvestable() external virtual view returns (uint256) {
        uint256 _pendingReward = IMasterChef(masterchef).pendingReward(poolId, address(this));
        return _pendingReward;
    }

    // **** Setters ****

    function deposit() public override {
        uint256 _want = IERC20(want).balanceOf(address(this));
        if (_want > 0) {
            IERC20(want).safeApprove(masterchef, 0);
            IERC20(want).safeApprove(masterchef, _want);
            IMasterChef(masterchef).deposit(poolId, _want);
        }
    }

    function _withdrawSome(uint256 _amount)
        internal
        override
        returns (uint256)
    {
        IMasterChef(masterchef).withdraw(poolId, _amount);
        return _amount;
    }

    // **** State Mutations ****

    function harvest() public override onlyBenevolent {
        // IMasterChef(masterchef).withdraw(poolId, 0);  // This withdraw from MasterChefJoeV3 to realize gains, because MCJv3 has no harvest function -> CURRENTLY CAUSES AND TRANSFER ERROR at: 0xd0c23f8a3777d96e7561b0b5c5ce8b5afc0c2fa1
        IMasterChef(masterchef).harvestFromMasterChef(); // [TODO]: check back later if this is ok
        uint256 _rewardBalance = IERC20(rewardToken).balanceOf(address(this));
        IERC20(rewardToken).safeTransfer(
            IParticipesDepositor(depositor).treasury(),
            _rewardBalance
        );
    }
}
