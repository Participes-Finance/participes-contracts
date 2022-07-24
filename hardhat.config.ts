import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-truffle5";
import "@nomiclabs/hardhat-vyper";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "solidity-coverage";

import { HardhatUserConfig } from "hardhat/config";

const {DEPLOYER_KEY} = require("./secrets.json");
 
const accounts = {
  // will need to enter mnemonic manually:
  // [TODO]: Figure out how to make this process automatic!!!!
  mnemonic: "nasty insane robust claim crew debate reopen wear ignore water situate chat",
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
      chainId: 137,
      forking: {
        url: "https://polygon-rpc.com/",
        blockNumber: 30807682, 
      },
      live: false,
      saveDeployments: true,
    },

    mumbai : {
      chainId: 80001,
      url: "https://rpc-mumbai.maticvigil.com",
      gas: 19000000,
      // gasPrice: 50e9,
      accounts: [DEPLOYER_KEY],
      live: true,
      saveDeployments: true,
    },

    ganache : {
      chainId: 1337,
      url: "http://127.0.0.1:8545",
      accounts,
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
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }
      },
      {
        version: "0.8.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }
      },
    ]
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
