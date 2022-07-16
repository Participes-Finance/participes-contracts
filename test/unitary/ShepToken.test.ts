import { ethers } from "hardhat";
import { expect } from "chai";

describe("PartsToken", function () {
  before(async function () {
    this.PartsToken = await ethers.getContractFactory("PartsToken")
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
  })

  beforeEach(async function () {
    this.parts = await this.PartsToken.deploy()
    await this.parts.deployed()
  })

  it("should have correct name and symbol and decimal", async function () {
    const name = await this.parts.name()
    const symbol = await this.parts.symbol()
    const decimals = await this.parts.decimals()
    expect(name, "PartsToken")
    expect(symbol, "PARTS")
    expect(decimals, "18")
  })

  it("should only allow owner to mint token", async function () {
    await this.parts["mint(address,uint256)"](this.alice.address, "100")
    await this.parts["mint(address,uint256)"](this.bob.address, "1000")
    await expect(this.parts.connect(this.bob)["mint(address,uint256)"](this.carol.address, "1000", { from: this.bob.address })).to.be.revertedWith(
      "Ownable: caller is not the owner"
    )
    const totalSupply = await this.parts.totalSupply()
    const aliceBal = await this.parts.balanceOf(this.alice.address)
    const bobBal = await this.parts.balanceOf(this.bob.address)
    const carolBal = await this.parts.balanceOf(this.carol.address)
    expect(totalSupply).to.equal("1100")
    expect(aliceBal).to.equal("100")
    expect(bobBal).to.equal("1000")
    expect(carolBal).to.equal("0")
  })

  it("should supply token transfers properly", async function () {
    await this.parts["mint(address,uint256)"](this.alice.address, "100")
    await this.parts["mint(address,uint256)"](this.bob.address, "1000")
    await this.parts.transfer(this.carol.address, "10")
    await this.parts.connect(this.bob).transfer(this.carol.address, "100", {
      from: this.bob.address,
    })
    const totalSupply = await this.parts.totalSupply()
    const aliceBal = await this.parts.balanceOf(this.alice.address)
    const bobBal = await this.parts.balanceOf(this.bob.address)
    const carolBal = await this.parts.balanceOf(this.carol.address)
    expect(totalSupply, "1100")
    expect(aliceBal, "90")
    expect(bobBal, "900")
    expect(carolBal, "110")
  })

  it("should fail if you try to do bad transfers", async function () {
    await this.parts["mint(address,uint256)"](this.alice.address, "100")
    await expect(this.parts.transfer(this.carol.address, "110")).to.be.revertedWith("BEP20: transfer amount exceeds balance")
    await expect(this.parts.connect(this.bob).transfer(this.carol.address, "1", { from: this.bob.address })).to.be.revertedWith(
      "BEP20: transfer amount exceeds balance"
    )
  })
})
