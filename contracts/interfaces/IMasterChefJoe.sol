// SPDX-License-Identifier: MIT
pragma solidity ^0.6.7;

interface IMasterChefJoe {
    function pendingTokens(uint256 _pid, address _user)
        external
        view
        returns (uint256, address, string memory, uint256);
}