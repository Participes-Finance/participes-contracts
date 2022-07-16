// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

// Used to get treasury address from Participes's MasterChefV2 contract
interface IParticipesDepositor {
  function treasury() external view returns (address);
}