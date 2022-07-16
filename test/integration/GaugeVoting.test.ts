import { ADDRESS_ZERO, advanceBlock, advanceBlockTo, advanceTimeAndBlock, deploy, getBigNumber, prepare, bigNumToInt } from "../utilities"
import { assert, expect } from "chai"
import { ethers } from "hardhat"
import { timeStamp } from "console"
import { BigNumber } from "ethers"
const YEAR = 86400 * 365 // a year passing as unix timestamp
const WEEK = 604800

describe("GaugeVoting", function () {
  before(async function () {
    // await prepare(this, ["MasterChef", "PartsToken", "ERC20Mock", "MasterChefV2", "RewarderMock", "RewarderBrokenMock"])
    await prepare(this, ["MasterChef", "PartsToken", "ERC20Mock", "MasterChefV2", "RewarderMock", "MockStrategy", "MasterChefMock", "MockToken", "GaugeController", "vePARTS"])
    // [TODO]: why deploy this?
    // await deploy(this, [["brokenRewarder", this.RewarderBrokenMock]])
  })

  beforeEach(async function () {
    await deploy(this, [
      ["parts", this.ERC20Mock, ["Participes", "PARTS", getBigNumber(1000)]], // [TODO]: Bonuses disabled, not rlly necessary for testing I think
    ])

    this.person1 = this.signers[6]
    this.person2 = this.signers[7]

    this.parts.connect(this.alice).transfer(this.person1.address, getBigNumber(750))
    this.parts.connect(this.alice).transfer(this.person2.address, getBigNumber(250))

    await deploy(this, [
      ["lp", this.ERC20Mock, ["lp token", "lpt", getBigNumber(10)]],
      ["mlp0", this.ERC20Mock, ["mock lp token", "MLP0", getBigNumber(10)]],
      ["mlp1", this.ERC20Mock, ["mock lp token", "MLP1", getBigNumber(10)]],
      ["dummy", this.ERC20Mock, ["Dummy", "DummyT", getBigNumber(10)]],
      ["mocktoken", this.MockToken],
      ["mock0", this.ERC20Mock, ["Mock0", "MOCK0", getBigNumber(69)]],
      ["mock1", this.ERC20Mock, ["Mock1", "MOCK1", getBigNumber(69)]],
      ["veparts", this.vePARTS, [this.parts.address, "Vote-escrowed Participes", "vePARTS", "1.0.0"]],
      // ["chefmock", this.MasterChefMock, [this.mocktoken.address, this.carol.address, getBigNumber(100), "0", "0"]], // [TODO]: Bonuses disabled, not rlly necessary for testing I think
      ["chef", this.MasterChef, [this.parts.address, this.bob.address, this.bob.address, getBigNumber(100), "0"]],
    ])

    await deploy(this, [
      ["chefmock", this.MasterChefMock, [this.mocktoken.address, this.carol.address, getBigNumber(100), "0", "0"]], // [TODO]: Bonuses disabled, not rlly necessary for testing I think
    ])

    await this.chef.add(100, this.lp.address, 0, true)
    await this.chef.add(100, this.dummy.address, 0, true)
    await this.lp.approve(this.chef.address, getBigNumber(10))
    await this.chef.deposit(0, getBigNumber(10))
    await this.chefmock.add(100, this.mock0.address, true)

    await deploy(this, [
      ["gaugectrl", this.GaugeController, [this.parts.address, this.veparts.address]],
      ["chef2", this.MasterChefV2],
      // ["strat", this.MockStrategy, [this.mocktoken.address, this.chefmock.address, this.mock0.address, this.mock1.address, 0, this.mocklp.address, this.carol.address]],
    ])

    await this.gaugectrl.set_masterchef(this.chef2.address)
    await this.dummy.approve(this.chef2.address, getBigNumber(10))
    await this.chef2.initialize(this.parts.address, this.bob.address, this.bob.address, this.gaugectrl.address)
    await this.chef2.setMasterChef( this.chef.address, 1, 100)
    await this.chef2.init(this.dummy.address)

    await this.gaugectrl["add_type(string,uint256)"]("default", 1)
    // await console.log(await this.gaugectrl.)
    console.log(1)
    // await this.gaugectrl["add_gauge(uint256,int128)"](0, 0)
    // await this.gaugectrl["add_gauge(uint256,int128)"](1, 0)
    // console.log(1)
    await this.chef2.add(50, this.mlp0.address, ADDRESS_ZERO, ADDRESS_ZERO, 0)
    await this.chef2.add(50, this.mlp1.address, ADDRESS_ZERO, ADDRESS_ZERO, 0) // initialize two pools with 50% of total allocPoints each 
 
    await this.parts.connect(this.person1).approve(this.veparts.address, getBigNumber(9999))
    await this.parts.connect(this.person2).approve(this.veparts.address, getBigNumber(9999))

  })

  it("pools should be initialized", async function () {
    let p1 = await this.chef.poolInfo(0)
    let p2 = await this.chef.poolInfo(1)
    // console.log(p1)
    // console.log(p2)
    expect(p1.allocPoint).to.be.equal

  })


  describe("GaugeController", function () {
    beforeEach(async function () {
      let blockNum = await ethers.provider.getBlockNumber()
      let now = await (await ethers.provider.getBlock(blockNum)).timestamp
      await this.veparts.connect(this.person1).create_lock(getBigNumber(750), now + 2*YEAR)
      await this.veparts.connect(this.person2).create_lock(getBigNumber(250), now + 2*YEAR)
    })

    it("should have vePARTS tokens", async function () {
      let blockNum = await ethers.provider.getBlockNumber()
      let now = await (await ethers.provider.getBlock(blockNum)).timestamp
      let p1Bal = await parseInt(await( await this.veparts["balanceOf(address,uint256)"](this.person1.address, now) ).toString())
      let p2Bal = await parseInt(await( await this.veparts["balanceOf(address,uint256)"](this.person2.address, now) ).toString())
      console.log(p1Bal)
      console.log(p2Bal)
      expect(p1Bal).to.be.greaterThan(0)
      expect(p2Bal).to.be.greaterThan(0)
    })

    it("Vote for Gauge weights of pools and apply them", async function () {
      advanceTimeAndBlock(1 * WEEK)
      advanceBlockTo(10)
      await this.gaugectrl.connect(this.person1).vote_for_gauge_weights(0, 10000) // voting power in basis points
      await this.gaugectrl.connect(this.person2).vote_for_gauge_weights(1, 10000)
      let g0 = await bigNumToInt(await this.gaugectrl.get_gauge_weight(0))
      let g1 = await bigNumToInt(await this.gaugectrl.get_gauge_weight(1))
      console.log(g0)
      console.log(g1)
      expect(g0).to.be.greaterThan(0)
      expect(g1).to.be.greaterThan(0)

      advanceTimeAndBlock(1 * WEEK)
      advanceBlockTo(10)

      // await this.gaugectrl.checkpoint()

      g0 = await parseInt (await (await this.gaugectrl["gauge_relative_weight(uint256)"](0) ).toString())
      g1 = await parseInt (await (await this.gaugectrl["gauge_relative_weight(uint256)"](1) ).toString())
      console.log("gauge for mock0: " + g0)
      console.log("gauge for mock1: " + g1)
      await this.chef2.updatePoolsFromGauges()
      // advanceBlock()
      let pool0 = await this.chef2.poolInfo(0)
      let pool1 = await this.chef2.poolInfo(1)
      let a0 = parseInt(pool0.allocPoint.toString())
      let a1 = parseInt(pool1.allocPoint.toString())
      let total = await parseInt( await (await this.chef2.totalAllocPoint()).toString()) 
      console.log(a0)
      console.log(a1)
      console.log(total)
      expect(a0).to.be.equal(g0)
      expect(a1).to.be.equal(g1)
      expect(a0 + a1).to.be.equal(total)
      

    })

  })

})