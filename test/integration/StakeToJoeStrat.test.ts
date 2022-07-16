import { ADDRESS_ZERO, advanceBlock, advanceBlockTo, advanceTime, deploy, getBigNumber, prepare } from "../utilities"
import { assert, expect } from "chai"
import { ethers } from "hardhat"
import { BigNumber } from "ethers"
const hre = require("hardhat") // [TODO]: yuck? fix later

// To impersonate an account use the this method, passing the address to impersonate as its parameter:
// await hre.network.provider.request({
//   method: "hardhat_impersonateAccount",
//   params: ["0x364d6D0333432C3Ac016Ca832fb8594A8cE43Ca6"],
// });
// If you are using hardhat-ethers (opens new window), call getSigner after impersonating the account:

// const signer = await ethers.getSigner("0x364d6D0333432C3Ac016Ca832fb8594A8cE43Ca6")
// signer.sendTransaction(...)

describe("StakeToJoeStrat", function () {
  let chefjoe2_address = "0xd6a4F121CA35509aF06A0Be99093d08462f53052"
  // let joewavaxLP_whale_address = "0x0F1410A815105F4429A404D2101890Aa11D97951" // has 40 avax at set block in hardhat config
  let joewavaxLP_whale_address = "0x7351102Eb34C69a9257fbc7e3e851d7d65aA14C8" // has 40 avax at set block in hardhat config
  let joe_address = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd"
  let joewavaxLP_address = "0x454e67025631c065d3cfad6d71e6892f74487a15"
  let wavax_address = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"
  let joewavax_rewarder_address = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"

  before(async function () {
    await prepare(this, ["MasterChef", "PartsToken", "ERC20Mock", "MasterChefV2", "RewarderMock", "JoeStrategy","vePARTS", "GaugeController"])
    // this.IERC20 = await hre.artifacts.readArtifact("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20")
    this.joewavaxLP = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", joewavaxLP_address)
    this.chefjoe2 = await ethers.getContractAt("contracts/strategies/IMasterChef.sol:IMasterChef", chefjoe2_address)
    this.joe = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", joe_address)

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [joewavaxLP_whale_address],
    });

    this.lpwhale = await ethers.getSigner(joewavaxLP_whale_address)
    // await this.alice.sendTransaction({to: joewavaxLP_whale_address, value: getBigNumber(10)}).then( x => console.log(x)) // send 10 ether to whale
  })

  beforeEach(async function () {
    await deploy(this, [["parts", this.PartsToken]])
    await deploy(this, [
      ["dummy", this.ERC20Mock, ["Dummy", "DummyT", getBigNumber(10)]],
      ["chef", this.MasterChef, [this.parts.address, this.bob.address, this.bob.address, getBigNumber(100), "0"]],
      ["chef2", this.MasterChefV2],
      ["veparts", this.vePARTS, [this.parts.address, "Vote-escrowed Participes", "vePARTS", "1.0.0"]],
    ])

    await deploy(this, [["strat", this.JoeStrategy, [this.chef2.address, joewavaxLP_address, joe_address, wavax_address, 0]]])

    await deploy(this, [ ["gaugectrl", this.GaugeController, [this.parts.address, this.veparts.address]], ])
    await this.gaugectrl.set_masterchef(this.chef2.address)
    await this.gaugectrl["add_type(string,uint256)"]("default", 1)

    await this.parts.transferOwnership(this.chef.address)
    await this.chef.add(100, this.dummy.address, 0, true)    
    await this.dummy.approve(this.chef.address, getBigNumber(10))    
    await this.dummy.approve(this.chef2.address, getBigNumber(10))    
    await this.joewavaxLP.connect(this.lpwhale).approve(this.chef2.address, getBigNumber(10))
    // await this.wavax.approve(joewavax_rewarder_address)

    // await this.joewavaxLP.connect(this.lpwhale).approve(this.chef2.address, getBigNumber(10))
    await this.chef2.initialize(this.parts.address, this.bob.address, this.carol.address, this.gaugectrl.address)
    await this.chef2.setMasterChef(this.chef.address, 0, getBigNumber(100))
    await this.chef2.init(this.dummy.address)
  })

  describe("Deposit", function () {
    beforeEach(async function () {
      await this.chef2.add(100, joewavaxLP_address, ADDRESS_ZERO, this.strat.address, 0)
      await this.chef2.connect(this.lpwhale).deposit(0, getBigNumber(5), joewavaxLP_whale_address)
    })
    it("Depositor harvests PARTS after deposit", async function () {
      advanceBlock()
      await this.chef2.connect(this.lpwhale).harvest(0, joewavaxLP_whale_address)
      let whalePartsBalance = parseInt(await(await this.parts.balanceOf(joewavaxLP_whale_address)).toString())
      console.log("joewavax whale PARTS Balance: " + whalePartsBalance)
      // console.log("gained: " + whalePartsBalance + " PARTS")
      await expect(whalePartsBalance).to.be.greaterThan(0)
    })
    it("Strategy deposits to MasterChefJoeV2 and gets JOE", async function () {
      let info = await this.chefjoe2.connect(this.lpwhale).userInfo(0, this.strat.address)

      // for (let i = 0; i < 68; i++) {
      //   let poolInfo = await this.chefjoe2.poolInfo(i)
      //   let lpaddr = poolInfo.lpToken.toString()
      //   console.log (i + ":" + lpaddr);
      // }

      let amount = parseInt(info.amount.toString())
      let rewardDebt = parseInt(info.rewardDebt.toString())
      console.log("rewardDebt: " + rewardDebt)
      advanceBlockTo(10)
      advanceTime(10)
      this.chef2.connect(this.lpwhale).deposit(0, 0, this.lpwhale.address)
      let joeAmount = await parseInt((await this.joe.balanceOf(this.strat.address)).toString())

      info = await this.chefjoe2.connect(this.lpwhale).userInfo(0, this.strat.address)
      rewardDebt = parseInt(info.rewardDebt.toString())
      console.log("rewardDebt: " + rewardDebt)
      await this.chef2.connect(this.lpwhale).deposit(0, 0, joewavaxLP_whale_address)
      // console.log(amount)
      await expect(amount).to.be.greaterThan(0)
      await expect(joeAmount).to.be.greaterThan(0)
    })

    it("Treasury receives strat rewards when after harvest", async function () {
      await console.log("balance of rewarder: " + await ethers.provider.getBalance("0xD0C23F8A3777D96e7561b0B5C5ce8b5aFC0c2fa1"))
      advanceBlockTo(100)
      await this.chef2.connect(this.lpwhale).deposit(0, "0", this.lpwhale.address) 
      let stratBal = await this.joe.balanceOf(this.strat.address)
      // await this.chef.connect(this.lpwhale).massHarvestFromStrategies()
      console.log("stratBal: " + stratBal)
      let balance = parseInt(await (await this.joe.balanceOf(this.carol.address)).toString())
      console.log("balance: " + balance)
      expect(balance).to.be.greaterThan(0)
    }) // [TODO]: Figure out why rewardDebt is so high, it prevents the strat contract from harvesting any JOE

    it("Harvestable tokens visible from strategy contract", async function () {
      advanceTime(1)
      let harvestable = parseInt(await (await this.strat.getHarvestable()).toString())
      console.log(harvestable)
      expect(harvestable).to.be.greaterThan(0)
    })
    it("Rewarder test", async function () {
      let before = await ethers.provider.getBalance("0xD0C23F8A3777D96e7561b0B5C5ce8b5aFC0c2fa1")
      let beforeJoe = await this.joe.balanceOf(this.lpwhale.address) 
      await console.log("balance of rewarder before: " + before)
      await console.log("joe balance of lpwhale: " + beforeJoe)
      await this.chefjoe2.connect(this.lpwhale).deposit(0, getBigNumber(100)) 
    
      advanceBlockTo(100)
      await this.chefjoe2.connect(this.lpwhale).withdraw(0, "0") 
      let afterJoe = await this.joe.balanceOf(this.lpwhale.address) 
      let after = await ethers.provider.getBalance("0xD0C23F8A3777D96e7561b0B5C5ce8b5aFC0c2fa1")
      await console.log("balance of rewarder after: " + after)
      await console.log("joe balance of lpwhale: " + afterJoe)
      // await console.log(after - before)
    })
  })

})