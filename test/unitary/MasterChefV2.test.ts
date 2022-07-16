import { ADDRESS_ZERO, advanceBlock, advanceBlockTo, deploy, getBigNumber, prepare } from "../utilities"
import { assert, expect } from "chai"

describe("MasterChefV2", function () {
  before(async function () {
    await prepare(this, ["MasterChef", "PartsToken", "ERC20Mock", "MasterChefV2", "RewarderMock", "MockStrategy", "MasterChefMock", "MockToken", "vePARTS", "GaugeController"])
  })

  beforeEach(async function () {
    await deploy(this, [["parts", this.PartsToken]])

    await deploy(this, [
      ["lp", this.ERC20Mock, ["lp token", "lpt", getBigNumber(10)]],
      ["mocklp", this.ERC20Mock, ["mock lp token", "mlp", getBigNumber(10)]],
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

    await this.parts.transferOwnership(this.chef.address)
    await this.chef.add(100, this.lp.address, 0, true) 
    await this.chef.add(100, this.dummy.address, 0, true)
    await this.lp.approve(this.chef.address, getBigNumber(10))
    await this.chefmock.add(100, this.mock0.address, true)

    await deploy(this, [
      ["gaugectrl", this.GaugeController, [this.parts.address, this.veparts.address]],
      ["chef2", this.MasterChefV2],
      ["strat", this.MockStrategy, [this.mocktoken.address, this.chefmock.address, this.mock0.address, this.mock1.address, 0, this.mocklp.address, this.carol.address]],
      ["rlp", this.ERC20Mock, ["LP", "rLPT", getBigNumber(10)]],
      ["r", this.ERC20Mock, ["Reward", "RewardT", getBigNumber(100000)]],
    ])

    await this.gaugectrl.set_masterchef(this.chef2.address)
    await this.gaugectrl["add_type(string,uint256)"]("default", 1)

    await deploy(this, [["rewarder", this.RewarderMock, [getBigNumber(1), this.r.address, this.chef2.address]]])
    await this.dummy.approve(this.chef2.address, getBigNumber(10))
    await this.chef2.initialize(this.parts.address, this.bob.address, this.bob.address, this.gaugectrl.address)
    await this.chef2.setMasterChef( this.chef.address, 1, 100)
    await this.chef2.init(this.dummy.address)
    await this.rlp.transfer(this.bob.address, getBigNumber(1))
  })

  describe("Init", function () {
    it("Balance of dummyToken should be 0 after init(), repeated execution should fail", async function () {
      await expect(this.chef2.init(this.dummy.address)).to.be.revertedWith("Balance must exceed 0")
    })
  })

  describe("PoolLength", function () {
    it("PoolLength should execute", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0) //  no strats in unit testing
      expect(await this.chef2.poolLength()).to.be.equal(1)
    })
  })

  describe("Set", function () {
    it("Should emit event LogSetPool", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await expect(this.chef2.set(0, 10, this.dummy.address, ADDRESS_ZERO, 0, false))
        .to.emit(this.chef2, "LogSetPool")
        .withArgs(0, 10, this.rewarder.address, false)
      await expect(this.chef2.set(0, 10, this.dummy.address, ADDRESS_ZERO, 0, true)).to.emit(this.chef2, "LogSetPool").withArgs(0, 10, this.dummy.address, true)
    })

    it("Should revert if invalid pool", async function () {
      let err
      try {
        await this.chef2.set(0, 10, this.rewarder.address, ADDRESS_ZERO, 0, false)
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("PendingParts", function () {
    it("PendingParts should equal ExpectedParts", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.chef2.updatePool(0)
      await advanceBlock()
      let expectedParts = 100
        *(log2.blockNumber + 1 - log.blockNumber)
        /(2)
      let pendingParts = await this.chef2.pendingParts(0, this.alice.address)
      expect(pendingParts).to.be.equal(expectedParts)
    })
    it("When block is lastRewardBlock", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(3)
      let log2 = await this.chef2.updatePool(0)
      let expectedParts = 100
         * (log2.blockNumber - log.blockNumber)
        /(2)
      let pendingParts = await this.chef2.pendingParts(0, this.alice.address)
      expect(pendingParts).to.be.equal(expectedParts)
    })
  })

  describe("MassUpdatePools", function () {
    it("Should call updatePool", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await advanceBlockTo(1)
      await this.chef2.massUpdatePools([0])
      //expect('updatePool'w).to.be.calledOnContract(); //not suported by heardhat
      //expect('updatePool').to.be.calledOnContractWith(0); //not suported by heardhat
    })

    it("Updating invalid pools should fail", async function () {
      let err
      try {
        await this.chef2.massUpdatePools([0, 10000, 100000])
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Add", function () {
    it("Should add pool with reward token multiplier", async function () {
      await expect(this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0))
        .to.emit(this.chef2, "LogPoolAddition")
        .withArgs(0, 10, this.rlp.address, this.rewarder.address)
    })
  })

  describe("UpdatePool", function () {
    it("Should emit event LogUpdatePool", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await advanceBlockTo(1)
      await expect(this.chef2.updatePool(0))
        .to.emit(this.chef2, "LogUpdatePool")
        .withArgs(
          0,
          (await this.chef2.poolInfo(0)).lastRewardBlock,
          await this.rlp.balanceOf(this.chef2.address),
          (await this.chef2.poolInfo(0)).accPartsPerShare
        )
    })

  // // [TODO]: wtf is batch?
  //   it("Should take else path", async function () {
  //     await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
  //     await advanceBlockTo(1)
  //     await this.chef2.batch(
  //       [this.chef2.interface.encodeFunctionData("updatePool", [0]), this.chef2.interface.encodeFunctionData("updatePool", [0])],
  //       true
  //     )
  //   })
  })

  describe("Deposit", function () {
    it("Depositing 0 amount", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      await expect(this.chef2.deposit(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chef2, "Deposit")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })

    it("Depositing into non-existent pool should fail", async function () {
      let err
      try {
        await this.chef2.deposit(1001, getBigNumber(0), this.alice.address)
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Withdraw", function () {
    it("Withdraw 0 amount", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await expect(this.chef2.withdraw(0, getBigNumber(0), this.alice.address))
        .to.emit(this.chef2, "Withdraw")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })
  })

  describe("Harvest", function () {
    it("Should give back the correct amount of PARTS and reward", async function () {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      expect(await this.chef2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(20)
      await this.chef2.harvestFromMasterChef()
      let log2 = await this.chef2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedParts = (100)
        *(log2.blockNumber - log.blockNumber)
        /(2)
      expect((await this.chef2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedParts)
      await this.chef2.harvest(0, this.alice.address)
      expect(await this.parts.balanceOf(this.alice.address))
        .to.be.equal(await this.r.balanceOf(this.alice.address))
        .to.be.equal(expectedParts)
    })
    it("Harvest with empty user balance", async function () {
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.chef2.harvest(0, this.alice.address)
    })

    it("Harvest for PARTS-only pool", async function () {
      await this.chef2.add(10, this.rlp.address, ADDRESS_ZERO, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      expect(await this.chef2.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.chef2.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      await this.chef2.harvestFromMasterChef()
      let log2 = await this.chef2.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedParts = (100)
        *(log2.blockNumber - log.blockNumber)
        /(2)
      expect((await this.chef2.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedParts)
      await this.chef2.harvest(0, this.alice.address)
      expect(await this.parts.balanceOf(this.alice.address)).to.be.equal(expectedParts)
    })
  })

  describe("EmergencyWithdraw", function () {
    it("Should emit event EmergencyWithdraw", async function () {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.chef2.add(10, this.rlp.address, this.rewarder.address, ADDRESS_ZERO, 0)
      await this.rlp.approve(this.chef2.address, getBigNumber(10))
      await this.chef2.deposit(0, getBigNumber(1), this.bob.address)
      //await this.chef2.emergencyWithdraw(0, this.alice.address)
      await expect(this.chef2.connect(this.bob).emergencyWithdraw(0, this.bob.address))
        .to.emit(this.chef2, "EmergencyWithdraw")
        .withArgs(this.bob.address, 0, getBigNumber(1), this.bob.address)
    })
  })
})
