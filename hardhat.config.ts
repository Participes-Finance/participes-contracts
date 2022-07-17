import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-vyper"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "solidity-coverage"

import { HardhatUserConfig } from "hardhat/config";

const accounts = {
  mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk",
  accountsBalance: "20000000000000000000000",
}


// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
// task("accounts", "Prints the list of accounts", async (args, hre) => {
//   for (const account of accounts) {
//     console.log(await account.address);
//   }
// });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat : {
      chainId: 80001,
      forking: {
        url: "https://rpc-mumbai.maticvigil.com",
        // blockNumber: 11105077, 
      },
      live: false,
      saveDeployments: true,
    },

    localhost : {
      live: false,
      saveDeployments: true,
    }
  },

  namedAccounts: {
    deployer: {
      default: 0,
    },
    dev: {
      // Default to 1
      default: 1,
      // dev address mainnet
      // 1: "",
    }
  },

  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 99999,
      },
    }
  },

  vyper: {
    version: "0.2.7",
  },

  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "deploy",
    sources: "contracts", 
    tests: "test",
  },

};

export default config;
