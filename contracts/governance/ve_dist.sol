// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.11;
pragma experimental ABIEncoderV2;

/*

@title Curve Fee Distribution modified for ve(3,3) emissions
@author Curve Finance, andrecronje
@license MIT

*/

import "hardhat/console.sol";

interface erc20 {
    function totalSupply() external view returns (uint256);
    function transfer(address recipient, uint amount) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function balanceOf(address) external view returns (uint);
    function transferFrom(address sender, address recipient, uint amount) external returns (bool);
    function approve(address spender, uint value) external returns (bool);
}

library Math {
    function min(uint a, uint b) internal pure returns (uint) {
        return a < b ? a : b;
    }
    function max(uint a, uint b) internal pure returns (uint) {
        return a >= b ? a : b;
    }
}

interface VotingEscrow {

    struct Point {
        int128 bias;
        int128 slope; // # -dweight / dt
        uint256 ts;
        uint256 blk; // block
    }

    function user_point_epoch(uint tokenId) external view returns (uint);
    function epoch() external view returns (uint);
    function user_point_history(uint tokenId, uint loc) external view returns (Point memory);
    function point_history(uint loc) external view returns (Point memory);
    function checkpoint() external;
    function deposit_for(uint tokenId, uint value) external;
    function ownerOf(uint tokenId) external view returns (address);
}

contract ve_dist {

    event CheckpointToken(
        uint time,
        uint tokens
    );

    event Claimed(
        uint tokenId,
        uint amount,
        uint claim_epoch,
        uint max_epoch
    );

    event ChangedDepositor(
        address newDepositor
    );

    struct Claimable{
        address token;
        uint amount;
    }


    uint constant WEEK = 7 * 86400;

    uint public start_time;
    uint public time_cursor;
    mapping(uint => uint) public time_cursor_of;
    mapping(uint => uint) public user_epoch_of;

    // uint public last_token_time;
    uint[1000000000000000] public last_token_times;
    // uint[1000000000000000][1000000000000000] public tokens_per_week; --> why tf u not use mappings eh?
    mapping(uint => mapping(uint => uint)) public tokens_per_week;

    address public voting_escrow;
    // address public token;
    address[] public tokens;
    // uint public token_last_balance;
    uint[1000000000000000] public token_last_balances;

    uint[1000000000000000] public ve_supply;

    address public depositor;

    constructor(address _voting_escrow, address[] memory _rewardTokens) {
        uint _t = block.timestamp / WEEK * WEEK;
        start_time = _t;
        time_cursor = _t;

        tokens = _rewardTokens;

        for(uint i; i < _rewardTokens.length; i++){
            last_token_times[i] = _t;
            erc20(_rewardTokens[i]).approve(_voting_escrow, type(uint).max);
        }

        voting_escrow = _voting_escrow;
        depositor = msg.sender;
    }

    // adds reward tokens for distribution
    function addRewardTokens(address[] memory _tokens) external{
        for(uint i; i < _tokens.length; i++){
            tokens.push(_tokens[i]);
        }
    }

    function getTokens() external view returns (address[] memory){
        return tokens;
    }

    function setDepositer(address _depositor) external {
        require(msg.sender == depositor);
        depositor = _depositor;
        emit ChangedDepositor(_depositor);
    }

    function timestamp() external view returns (uint) {
        return block.timestamp / WEEK * WEEK;
    }

    function _checkpoint_token(uint256 _index) internal {
        uint token_balance = erc20(tokens[_index]).balanceOf(address(this));
        uint to_distribute = token_balance - token_last_balances[_index];
        token_last_balances[_index] = token_balance;

        uint t = last_token_times[_index];
        uint since_last = block.timestamp - t;
        last_token_times[_index] = block.timestamp;
        uint this_week = t / WEEK * WEEK;
        uint next_week = 0;

        for (uint i = 0; i < 20; i++) {
            next_week = this_week + WEEK;
            if (block.timestamp < next_week) {
                if (since_last == 0 && block.timestamp == t) {
                    tokens_per_week[this_week][_index] += to_distribute;
                } else {
                    tokens_per_week[this_week][_index] += to_distribute * (block.timestamp - t) / since_last;
                }
                break;
            } else {
                if (since_last == 0 && next_week == t) {
                    tokens_per_week[this_week][_index] += to_distribute;
                } else {
                    tokens_per_week[this_week][_index] += to_distribute * (next_week - t) / since_last;
                }
            }
            t = next_week;
            this_week = next_week;
        }
        emit CheckpointToken(block.timestamp, to_distribute);
    }

    function checkpoint_token() external {
        // assert(msg.sender == depositor); anyone should be able to do this????? all it does it update the tracked balance of tokens???
        for(uint index; index < tokens.length; index ++){
            _checkpoint_token(index);
        }
    }

    function _find_timestamp_epoch(address ve, uint _timestamp) internal view returns (uint) {
        uint _min = 0;
        uint _max = VotingEscrow(ve).epoch();
        for (uint i = 0; i < 128; i++) {
            if (_min >= _max) break;
            uint _mid = (_min + _max + 2) / 2;
            VotingEscrow.Point memory pt = VotingEscrow(ve).point_history(_mid);
            if (pt.ts <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    function _find_timestamp_user_epoch(address ve, uint tokenId, uint _timestamp, uint max_user_epoch) internal view returns (uint) {
        uint _min = 0;
        uint _max = max_user_epoch;
        for (uint i = 0; i < 128; i++) {
            if (_min >= _max) break;
            uint _mid = (_min + _max + 2) / 2;
            VotingEscrow.Point memory pt = VotingEscrow(ve).user_point_history(tokenId, _mid);
            if (pt.ts <= _timestamp) {
                _min = _mid;
            } else {
                _max = _mid -1;
            }
        }
        return _min;
    }

    function ve_for_at(uint _tokenId, uint _timestamp) external view returns (uint) {
        address ve = voting_escrow;
        uint max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
        uint epoch = _find_timestamp_user_epoch(ve, _tokenId, _timestamp, max_user_epoch);
        VotingEscrow.Point memory pt = VotingEscrow(ve).user_point_history(_tokenId, epoch);
        return Math.max(uint(int256(pt.bias - pt.slope * (int128(int256(_timestamp - pt.ts))))), 0);
    }

    function _checkpoint_total_supply() internal {
        address ve = voting_escrow;
        uint t = time_cursor;
        uint rounded_timestamp = block.timestamp / WEEK * WEEK;
        VotingEscrow(ve).checkpoint();

        for (uint i = 0; i < 20; i++) {
            if (t > rounded_timestamp) {
                break;
            } else {
                uint epoch = _find_timestamp_epoch(ve, t);
                VotingEscrow.Point memory pt = VotingEscrow(ve).point_history(epoch);
                int128 dt = 0;
                if (t > pt.ts) {
                    dt = int128(int256(t - pt.ts));
                }
                ve_supply[t] = Math.max(uint(int256(pt.bias - pt.slope * dt)), 0);
            }
            t += WEEK;
        }
        time_cursor = t;
    }

    function checkpoint_total_supply() external {
        _checkpoint_total_supply();
    }

    function _claim(uint _tokenId, address ve, uint _last_token_time) internal returns (uint [] memory) {
        uint user_epoch = 0;
        // uint to_distribute = 0;
        uint[] memory to_distribute  = new uint[](tokens.length);

        // intialize amounts to distribute
        // for(uint i; i <= tokens.length; i++){
        //     to_distribute[0];
        // }

        uint max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
        uint _start_time = start_time;

        if (max_user_epoch == 0) return to_distribute;

        uint week_cursor = time_cursor_of[_tokenId];
        if (week_cursor == 0) {
            user_epoch = _find_timestamp_user_epoch(ve, _tokenId, _start_time, max_user_epoch);
        } else {
            user_epoch = user_epoch_of[_tokenId];
        }

        if (user_epoch == 0) user_epoch = 1;

        VotingEscrow.Point memory user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);

        if (week_cursor == 0) week_cursor = (user_point.ts + WEEK - 1) / WEEK * WEEK;
        if (week_cursor >= _last_token_time) return to_distribute;
        if (week_cursor < _start_time) week_cursor = _start_time;

        VotingEscrow.Point memory old_user_point;

        // max claim time is within 50 weeks (this is done to save gas when claiming rewards)!!!
        for (uint i = 0; i < 50; i++) {
            if (week_cursor >= _last_token_time) break;

            if (week_cursor >= user_point.ts && user_epoch <= max_user_epoch) {
                user_epoch += 1;
                old_user_point = user_point;
                if (user_epoch > max_user_epoch) {
                    user_point = VotingEscrow.Point(0,0,0,0);
                } else {
                    user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);
                }
            } else {
                int128 dt = int128(int256(week_cursor - old_user_point.ts));
                uint balance_of = Math.max(uint(int256(old_user_point.bias - dt * old_user_point.slope)), 0);
                if (balance_of == 0 && user_epoch > max_user_epoch) break;
                if (balance_of > 0) {
                    for(uint j; j < tokens.length; j++){
                        to_distribute[j] += balance_of * tokens_per_week[week_cursor][j] / ve_supply[week_cursor];
                    }
                }
                week_cursor += WEEK;
            }
        }

        user_epoch = Math.min(max_user_epoch, user_epoch - 1);
        user_epoch_of[_tokenId] = user_epoch;
        time_cursor_of[_tokenId] = week_cursor;

        //gets the address of the owner of the NFT and sends him their rewards
        address addr = VotingEscrow(voting_escrow).ownerOf(_tokenId);
        for(uint i; i < tokens.length; i++){
            if (to_distribute[i] != 0){
                address token = tokens[i];
                assert(erc20(token).transfer(addr, to_distribute[i]));
                token_last_balances[i] -= to_distribute[i];
                emit Claimed(_tokenId, to_distribute[i], user_epoch, max_user_epoch);
            }
        }

        return to_distribute;
    }

    function _claimable(uint _tokenId, address ve, uint _last_token_time) internal view returns (Claimable [] memory) {
        uint user_epoch = 0;
        Claimable[] memory to_distribute = new Claimable[](tokens.length);

        // for(int i; i <= tokens.length; i++){
        //     to_distribute.push(Claimable(0, 0));
        // }

        uint max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
        uint _start_time = start_time;

        if (max_user_epoch == 0) return to_distribute;

        uint week_cursor = time_cursor_of[_tokenId];
        if (week_cursor == 0) {
            user_epoch = _find_timestamp_user_epoch(ve, _tokenId, _start_time, max_user_epoch);
        } else {
            user_epoch = user_epoch_of[_tokenId];
        }

        if (user_epoch == 0) user_epoch = 1;

        VotingEscrow.Point memory user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);

        console.log("week_cursor:");
        console.log(week_cursor);
        console.log("_last_token_time:");
        console.log(_last_token_time);

        if (week_cursor == 0) week_cursor = (user_point.ts + WEEK - 1) / WEEK * WEEK;
        console.log("week_cursor after check:");
        console.log(week_cursor);
        // if (week_cursor >= last_token_time) return 0; // [TODO]: What do I do about this>
        if (week_cursor >= _last_token_time) return to_distribute; //  temp fix (probs won't rlly work in our case :C )
        if (week_cursor < _start_time) week_cursor = _start_time;

        VotingEscrow.Point memory old_user_point;

        for (uint i = 0; i < 50; i++) {
            if (week_cursor >= _last_token_time) break;

            console.log("--------------");
            console.log(i);
            console.log("user: ");
            console.log(user_epoch);
            console.log("max: ");
            console.log(max_user_epoch);
            console.log("--------------");

            if (week_cursor >= user_point.ts && user_epoch <= max_user_epoch) {
                user_epoch += 1;
                old_user_point = user_point;
                if (user_epoch > max_user_epoch) {
                    user_point = VotingEscrow.Point(0,0,0,0);
                } else {
                    user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);
                }
            } else {
                int128 dt = int128(int256(week_cursor - old_user_point.ts));

                console.log("after dt:");
                console.log(uint128(dt));
                console.log("week_cursor:");
                console.log(week_cursor);
                console.log("old_user_point.bias");
                console.log(uint128(old_user_point.bias));
                console.log("old_user_point.ts");
                console.log(old_user_point.ts);
                console.log("old_user_point.slope");
                console.log(uint128(old_user_point.slope));

                uint balance_of = Math.max(uint(int256(old_user_point.bias - dt * old_user_point.slope)), 0);
                console.log("balance_of:");
                console.log(balance_of);
                if (balance_of == 0 && user_epoch > max_user_epoch) break;
                if (balance_of > 0) {
                    for(uint j; j < tokens.length; j++){
                        console.log('token index: ');
                        console.log(j);
                        to_distribute[j].token = tokens[j];
                        to_distribute[j].amount += balance_of * tokens_per_week[week_cursor][j] / ve_supply[week_cursor];
                    }
                }
                week_cursor += WEEK;
            }
        }

        return to_distribute;
    }

    // returns claimable rewards 
    function claimable(uint _tokenId) external view returns (Claimable [] memory) {
        // uint _last_token_time = last_token_time / WEEK * WEEK; // [TODO]: what do I do about this?
        uint last_token_time = last_token_times[0];// temp fix
        // if(block.timestamp > last_token_time){ is this really needed here?
        //     for(uint i; i <= tokens.length; i++){
        //         _checkpoint_token(i);
        //     }
        // }

        uint _last_token_time = last_token_time / WEEK * WEEK;
        Claimable[] memory claimables  = _claimable(_tokenId, voting_escrow, _last_token_time);
        return claimables;
    }

    function claim(uint _tokenId) external returns (uint [] memory) {
        if (block.timestamp >= time_cursor) _checkpoint_total_supply();

        uint _last_token_time = last_token_times[0];
        // if(block.timestamp > _last_token_time){
        //     for(uint i; i <= tokens.length; i++){
        //         _checkpoint_token(i);
        //     }
        // }

        _last_token_time = _last_token_time / WEEK * WEEK;
        uint[] memory amount = _claim(_tokenId, voting_escrow, _last_token_time);
        // if (amount != 0) {
        //     VotingEscrow(voting_escrow).deposit_for(_tokenId, amount);
        //     token_last_balance -= amount;
        // }
        return amount;
    }

    function claim_many(uint[] memory _tokenIds) external returns (bool) {
        if (block.timestamp >= time_cursor) _checkpoint_total_supply();
        // uint _last_token_time = last_token_time / WEEK * WEEK; // [TODO]: what do I do about this?
        uint last_token_time = last_token_times[0];// temp fix
        uint _last_token_time = last_token_time / WEEK * WEEK;
        _last_token_time = _last_token_time / WEEK * WEEK;
        address _voting_escrow = voting_escrow;
        uint[] memory totals  = new uint[](tokens.length);

        // for(int k; k <= tokens.length; k ++){
        //     totals.push(0);
        // }

        for (uint i = 0; i < _tokenIds.length; i++) {
            uint _tokenId = _tokenIds[i];
            if (_tokenId == 0) break;
            uint[] memory amount = _claim(_tokenId, _voting_escrow, _last_token_time);
            // if (amount != 0) {
            //     VotingEscrow(_voting_escrow).deposit_for(_tokenId, amount);
            //     total += amount;
            // }
            for(uint j; j < amount.length; j++){
                totals[j] += amount[j];
            }
        }

        for(uint h; h < totals.length; h++){
            if (totals[h] != 0) {
                token_last_balances[h] -= totals[h];
            }
        }

        return true;
    }

    // Once off event on contract initialize
    function setDepositor(address _depositor) external {
        require(msg.sender == depositor);
        depositor = _depositor;
    }
}