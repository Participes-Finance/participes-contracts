// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./libs/SignedSafeMath.sol";
import "./interfaces/IRewarder.sol";
import "./interfaces/IMasterChef.sol";
import "./interfaces/IStrategy.sol";


interface IGaugeController{
    function gauge_relative_weight(uint256 pid) external view returns(uint256);
    function add_gauge(uint256 pid, int128 gauge_type, uint256 weight) external;
}

/// @notice The (older) MasterChef contract gives out a constant number of PARTS tokens per block.
/// It is the only address with minting rights for PARTS.
/// The idea for this MasterChef V2 (MCV2) contract is therefore to be the owner of a dummy token
/// that is deposited into the MasterChef V1 (MCV1) contract.
/// The allocation point for this pool on MCV1 is the total allocation point for all pools that receive double incentives.
contract MasterChefV2 is OwnableUpgradeable {
    using SafeMath for uint256;
    using BoringMath128 for uint128;
    using BoringERC20 for IERC20;
    using SignedSafeMath for int256;

    /// @notice Info of each MCV2 user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of PARTS entitled to the user.
    struct UserInfo {
        uint256 amount;
        int256 rewardDebt;
    }

    /// @notice Info of each MCV2 pool.
    /// `allocPoint` The amount of allocation points assigned to the pool.
    /// Also known as the amount of PARTS to distribute per block.
    struct PoolInfo {
        uint256 accPartsPerShare;
        uint256 lastRewardBlock;
        uint256 allocPoint;
        uint256 depositFee;
    }

    /// @notice Address of MCV1 contract.
    IMasterChef public MASTER_CHEF;
    /// @notice Address of PARTS contract.
    IERC20 public PARTS;
    /// @notice The index of MCV2 master pool in MCV1.
    uint256 public MASTER_PID;

    /// @notice Info of each MCV2 pool.
    PoolInfo[] public poolInfo;
    /// @notice Address of the LP token for each MCV2 pool.
    IERC20[] public lpToken;
    /// @notice Address of each `IRewarder` contract in MCV2.
    IRewarder[] public rewarder;
    /// @notice Address of each `IStrategy`.
    IStrategy[] public strategies;

    /// @notice Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    /// @dev Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    uint256 public MASTERCHEF_PARTS_PER_BLOCK;
    uint256 public ACC_PARTS_PRECISION;

    // Deposit Fee Address
    address public feeAddress;

    mapping(uint256 => address) public feeAddresses;

    address public treasury;
    address public gaugeController; // Address of Gauge Controller contract

    event Deposit(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        address indexed to
    );
    event Withdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        address indexed to
    );
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount,
        address indexed to
    );
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event LogPoolAddition(
        uint256 indexed pid,
        uint256 allocPoint,
        IERC20 indexed lpToken,
        IRewarder indexed rewarder
    );
    event LogSetPool(
        uint256 indexed pid,
        uint256 allocPoint,
        IRewarder indexed rewarder,
        bool overwrite
    );
    event LogUpdatePool(
        uint256 indexed pid,
        uint256 lastRewardBlock,
        uint256 lpSupply,
        uint256 accPartsPerShare
    );
    event LogInit();
    event DepositToLiquidDepositor(uint256 amount, address token);
    event WithdrawFromLiquidDepositor(uint256 amount, address token);

    modifier onlyController{
        require(msg.sender == gaugeController, "Controller Only");
        _;

    }

    constructor() public {}

    function initialize(
        IERC20 _parts,
        address _feeAddress,
        address _treasury,
        address _gaugeController
    ) public initializer {
        __Ownable_init();
        PARTS = _parts;
        feeAddress = _feeAddress;
        treasury = _treasury;
        gaugeController = _gaugeController;
        ACC_PARTS_PRECISION = 1e18;
    }

    function setMasterChef(
        IMasterChef masterChef,
        uint256 masterPid,
        uint256 masterChefPartsPerBlock
    ) external onlyOwner {
        MASTER_CHEF = masterChef;
        MASTER_PID = masterPid;
        MASTERCHEF_PARTS_PER_BLOCK = masterChefPartsPerBlock;
    }

    function setFeeAddress(address _feeAddress) public {
        require(
            msg.sender == feeAddress || msg.sender == owner(),
            "setFeeAddress: FORBIDDEN"
        );
        feeAddress = _feeAddress;
    }

    function setFeeAddresses(uint256 pid, address _feeAddress) public {
        require(
            msg.sender == feeAddress || msg.sender == owner(),
            "setFeeAddress: FORBIDDEN"
        );
        feeAddresses[pid] = _feeAddress;
    }

    function setTreasuryAddress(address _treasuryAddress) public {
        require(
            msg.sender == treasury || msg.sender == owner(),
            "setTreasuryAddress: FORBIDDEN"
        );
        treasury = _treasuryAddress;
    }

    function setGaugeControllerAddress(address _gaugeControllerAddress) public {
        require(
            msg.sender == gaugeController || msg.sender == owner(),
            "setGaugeControllerAddress: FORBIDDEN"
        );
        gaugeController = _gaugeControllerAddress;
    }


    /// @notice Deposits a dummy token to `MASTER_CHEF` MCV1. This is required because MCV1 holds the minting rights for PARTS.
    /// Any balance of transaction sender in `dummyToken` is transferred.
    /// The allocation point for the pool on MCV1 is the total allocation point for all pools that receive double incentives.
    /// @param dummyToken The address of the ERC-20 token to deposit into MCV1.
    function init(IERC20 dummyToken) external {
        uint256 balance = dummyToken.balanceOf(msg.sender);
        require(balance != 0, "MasterChefV2: Balance must exceed 0");
        dummyToken.safeTransferFrom(msg.sender, address(this), balance);
        dummyToken.approve(address(MASTER_CHEF), balance);
        MASTER_CHEF.deposit(MASTER_PID, balance);
        emit LogInit();
    }

    /// @notice Returns the number of MCV2 pools.
    function poolLength() public view returns (uint256 pools) {
        pools = poolInfo.length;
    }

    /// @notice Add a new LP to the pool. Can only be called by the owner.
    /// DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    /// @param allocPoint AP of the new pool.
    /// @param _lpToken Address of the LP ERC-20 token.
    /// @param _rewarder Address of the rewarder delegate.
    /// @param _strategy Address of the strategy to send user-deposited lp tokens to 
    function add(
        uint256 allocPoint,
        IERC20 _lpToken,
        IRewarder _rewarder,
        IStrategy _strategy,
        uint256 _depositFee
    ) public onlyOwner {
         uint256 lastRewardBlock = block.number;
        totalAllocPoint = totalAllocPoint.add(allocPoint);
        lpToken.push(_lpToken);
        rewarder.push(_rewarder);
        strategies.push(_strategy);

        poolInfo.push(
            PoolInfo({
                allocPoint: allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPartsPerShare: 0,
                depositFee: _depositFee
            })
        );

        uint256 len = poolLength();
        IGaugeController(gaugeController).add_gauge(len-1, 0, 0);

        emit LogPoolAddition(
            lpToken.length.sub(1),
            allocPoint,
            _lpToken,
            _rewarder
        );
    }

    /// @notice Update the given pool's PARTS allocation point and `IRewarder` contract. Can only be called by the owner.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _allocPoint New AP of the pool.
    /// @param _rewarder Address of the rewarder delegate.
    /// @param overwrite True if _rewarder should be `set`. Otherwise `_rewarder` is ignored.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        IRewarder _rewarder,
        IStrategy _strategy,
        uint256 _depositFee,
        bool overwrite
    ) public onlyOwner {
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].depositFee = _depositFee;
        if (overwrite) {
            rewarder[_pid] = _rewarder;

            if (address(strategies[_pid]) != address(_strategy)) {
                if (address(strategies[_pid]) != address(0)) {
                    _withdrawAllFromStrategy(_pid, strategies[_pid]);
                }
                if (address(_strategy) != address(0)) {
                    _depositAllToStrategy(_pid, _strategy);
                }
                strategies[_pid] = _strategy;
            }
        }

        emit LogSetPool(
            _pid,
            _allocPoint,
            overwrite ? _rewarder : rewarder[_pid],
            overwrite
        );
    }

    function updatePoolsFromGauges() public onlyOwner{
        uint256 len = poolLength();
        // uint256 time = block.timestamp;
        for (uint256 _pid = 0; _pid < len; ++_pid) {
            uint256 _allocPoint = IGaugeController(gaugeController).gauge_relative_weight(_pid);
            set(_pid, _allocPoint, rewarder[_pid], strategies[_pid], poolInfo[_pid].depositFee, false);
        }
    }

    function _withdrawAllFromStrategy(uint256 _pid, IStrategy _strategy)
        internal
    {
        IERC20 _lpToken = lpToken[_pid];
        uint256 _strategyBalance = _strategy.balanceOf();
        require(address(_lpToken) == _strategy.want(), "!lpToken");

        if (_strategyBalance > 0) {
            _strategy.withdraw(_strategyBalance);
            uint256 _currentBalance = _lpToken.balanceOf(address(this));

            require(_currentBalance >= _strategyBalance, "!balance1");

            _strategyBalance = _strategy.balanceOf();
            require(_strategyBalance == 0, "!balance2");
        }
    }

    function _depositAllToStrategy(uint256 _pid, IStrategy _strategy) internal {
        IERC20 _lpToken = lpToken[_pid];
        uint256 _strategyBalanceBefore = _strategy.balanceOf();
        uint256 _balanceBefore = _lpToken.balanceOf(address(this));
        require(address(_lpToken) == _strategy.want(), "!lpToken");

        if (_balanceBefore > 0) {
            _lpToken.safeTransfer(address(_strategy), _balanceBefore);
            _strategy.deposit();

            uint256 _strategyBalanceAfter = _strategy.balanceOf();
            uint256 _strategyBalanceDiff = _strategyBalanceAfter.sub(
                _strategyBalanceBefore
            );

            require(_strategyBalanceDiff == _balanceBefore, "!balance1");

            uint256 _balanceAfter = _lpToken.balanceOf(address(this));
            require(_balanceAfter == 0, "!balance2");
        }
    }

    /// @notice View function to see pending PARTS on frontend.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _user Address of user.
    /// @return pending PARTS reward for a given user.
    function pendingParts(uint256 _pid, address _user)
        external
        view
        returns (uint256 pending)
    {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accPartsPerShare = pool.accPartsPerShare;
        uint256 lpSupply;

        if (address(strategies[_pid]) != address(0)) {
            lpSupply = lpToken[_pid].balanceOf(address(this)).add(
                strategies[_pid].balanceOf()
            );
        } else {
            lpSupply = lpToken[_pid].balanceOf(address(this));
        }

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number.sub(pool.lastRewardBlock);
            uint256 partsReward = blocks.mul(partsPerBlock()).mul(
                pool.allocPoint
            ) / totalAllocPoint;
            accPartsPerShare = accPartsPerShare.add(
                partsReward.mul(ACC_PARTS_PRECISION) / lpSupply
            );
        }
        pending = int256(user.amount.mul(accPartsPerShare) / ACC_PARTS_PRECISION)
            .sub(user.rewardDebt)
            .toUInt256();
    }

    /// @notice Update reward variables for all pools. Be careful of gas spending!
    /// @param pids Pool IDs of all to be updated. Make sure to update all active pools.
    function massUpdatePools(uint256[] calldata pids) external {
        uint256 len = pids.length;
        for (uint256 i = 0; i < len; ++i) {
            updatePool(pids[i]);
        }
    }

    function massHarvestFromStrategies() external {
        uint256 len = strategies.length;
        for (uint256 i = 0; i < len; ++i) {
            if (address(strategies[i]) != address(0)) {
                strategies[i].harvest();
            }
        }
    }

    /// @notice Calculates and returns the `amount` of PARTS per block.
    function partsPerBlock() public view returns (uint256 amount) {
        amount =
            uint256(MASTERCHEF_PARTS_PER_BLOCK).mul(
                MASTER_CHEF.poolInfo(MASTER_PID).allocPoint
            ) /
            MASTER_CHEF.totalAllocPoint();
    }

    /// @notice Update reward variables of the given pool.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @return pool Returns the pool that was updated.
    function updatePool(uint256 pid) public returns (PoolInfo memory pool) {
        pool = poolInfo[pid];
        if (block.number > pool.lastRewardBlock) {
            uint256 lpSupply;

            if (address(strategies[pid]) != address(0)) {
                lpSupply = lpToken[pid].balanceOf(address(this)).add(
                    strategies[pid].balanceOf()
                );
            } else {
                lpSupply = lpToken[pid].balanceOf(address(this));
            }

            if (lpSupply > 0) {
                uint256 blocks = block.number.sub(pool.lastRewardBlock);
                uint256 partsReward = blocks.mul(partsPerBlock()).mul(
                    pool.allocPoint
                ) / totalAllocPoint;
                pool.accPartsPerShare = pool.accPartsPerShare.add(
                    partsReward.mul(ACC_PARTS_PRECISION) / lpSupply
                );
            }
            pool.lastRewardBlock = block.number;
            poolInfo[pid] = pool;
            emit LogUpdatePool(
                pid,
                pool.lastRewardBlock,
                lpSupply,
                pool.accPartsPerShare
            );
        }
    }

    /// @notice Deposit LP tokens to MCV2 for PARTS allocation.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to deposit.
    /// @param to The receiver of `amount` deposit benefit.
    function deposit(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][to];
        address _feeAddress = feeAddresses[pid];

        if (_feeAddress == address(0)) {
            _feeAddress = feeAddress;
        }

        // Effects
        uint256 depositFeeAmount = amount.mul(pool.depositFee).div(10000);
        user.amount = user.amount.add(amount).sub(depositFeeAmount);
        user.rewardDebt = user.rewardDebt.add(
            int256(amount.mul(pool.accPartsPerShare) / ACC_PARTS_PRECISION)
        );

        // Interactions
        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onPartsReward(pid, to, to, 0, user.amount);
        }

        lpToken[pid].safeTransferFrom(msg.sender, address(this), amount);
        lpToken[pid].safeTransfer(_feeAddress, depositFeeAmount);

        IStrategy _strategy = strategies[pid];
        if (address(_strategy) != address(0)) {
            uint256 _amount = lpToken[pid].balanceOf(address(this));
            lpToken[pid].safeTransfer(address(_strategy), _amount);
            _strategy.deposit();
        }

        emit Deposit(msg.sender, pid, amount, to);
    }

    function _withdraw(
        uint256 amount,
        uint256 pid,
        address to
    ) internal returns (uint256) {
        uint256 balance = lpToken[pid].balanceOf(address(this));
        IStrategy strategy = strategies[pid];
        if (amount > balance) {
            uint256 missing = amount.sub(balance);
            uint256 withdrawn = strategy.withdraw(missing);
            amount = balance.add(withdrawn);
        }

        lpToken[pid].safeTransfer(to, amount);

        return amount;
    }

    /// @notice Withdraw LP tokens from MCV2.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to withdraw.
    /// @param to Receiver of the LP tokens.
    function withdraw(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];

        // Effects
        user.rewardDebt = user.rewardDebt.sub(
            int256(amount.mul(pool.accPartsPerShare) / ACC_PARTS_PRECISION)
        );
        user.amount = user.amount.sub(amount);

        // Interactions
        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onPartsReward(pid, msg.sender, to, 0, user.amount);
        }

        // lpToken[pid].safeTransfer(to, amount);
        amount = _withdraw(amount, pid, to);

        emit Withdraw(msg.sender, pid, amount, to);
    }

    /// @notice Harvest proceeds for transaction sender to `to`.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param to Receiver of PARTS rewards.
    function harvest(uint256 pid, address to) public {
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];
        int256 accumulatedParts = int256(
            user.amount.mul(pool.accPartsPerShare) / ACC_PARTS_PRECISION
        );
        uint256 _pendingParts = accumulatedParts.sub(user.rewardDebt).toUInt256();

        harvestFromMasterChef();

        // Effects
        user.rewardDebt = accumulatedParts;

        // Interactions
        if (_pendingParts != 0) {
            PARTS.safeTransfer(to, _pendingParts);
        }

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onPartsReward(
                pid,
                msg.sender,
                to,
                _pendingParts,
                user.amount
            );
        }

        emit Harvest(msg.sender, pid, _pendingParts);
    }

    /// @notice Withdraw LP tokens from MCV2 and harvest proceeds for transaction sender to `to`.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to withdraw.
    /// @param to Receiver of the LP tokens and PARTS rewards.
    function withdrawAndHarvest(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];
        int256 accumulatedParts = int256(
            user.amount.mul(pool.accPartsPerShare) / ACC_PARTS_PRECISION
        );
        uint256 _pendingParts = accumulatedParts.sub(user.rewardDebt).toUInt256();

        // Effects
        user.rewardDebt = accumulatedParts.sub(
            int256(amount.mul(pool.accPartsPerShare) / ACC_PARTS_PRECISION)
        );
        user.amount = user.amount.sub(amount);

        // Interactions
        PARTS.safeTransfer(to, _pendingParts);

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onPartsReward(
                pid,
                msg.sender,
                to,
                _pendingParts,
                user.amount
            );
        }

        // lpToken[pid].safeTransfer(to, amount);
        _withdraw(amount, pid, to);

        emit Withdraw(msg.sender, pid, amount, to);
        emit Harvest(msg.sender, pid, _pendingParts);
    }

    /// @notice Harvests PARTS from `MASTER_CHEF` MCV1 and pool `MASTER_PID` to this MCV2 contract.
    function harvestFromMasterChef() public {
        MASTER_CHEF.deposit(MASTER_PID, 0);
    }

    /// @notice Withdraw without caring about rewards. EMERGENCY ONLY.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param to Receiver of the LP tokens.
    function emergencyWithdraw(uint256 pid, address to) public {
        UserInfo storage user = userInfo[pid][msg.sender];
        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onPartsReward(pid, msg.sender, to, 0, 0);
        }

        // Note: transfer can fail or succeed if `amount` is zero.
        amount = _withdraw(amount, pid, to);
        // lpToken[pid].safeTransfer(to, amount);
        emit EmergencyWithdraw(msg.sender, pid, amount, to);
    }
}
