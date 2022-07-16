# Participes Contracts - WIP

- /contracts : contracts for the Participes protocol
  - /governance: contains Vyper contracts based on a part of curve.fi's dao contracts
- /tests : tests for the contracts
- /deploy : contains deployment contracts (INCOMPLETE)

# Local Development
The following assumes the use of `node@>=10`.

## Install Dependencies

`yarn`

## Compile Contracts

`yarn compile`

## Run Coverage and/or Tests

`yarn test`

By default, the Avalanche mainnet is forked at block #11105077 when testing

## Deployment

The deployment scripts are not yet complete, the ones which currently exist in the repository have been ripped
straight out of Sushiswap repository. This will be rectified once the smart contracts become more polished, along with the testing suite.

# Contract Architecture
See [here](ARCHITECTURE.md)


## TODO:
 - Rewrite vePARTS-test.js as a typescript file.
 - Figure out how Sushiswap is able to clean block-dependent tests working (compare the way Participes uses advanceBlockTo() oin
 its tests vs Sushiswap).
 - Rewrite MasterChefV2 to not be dependent on MasterChef for PARTS minting rights.
 - Write deployment scripts.

