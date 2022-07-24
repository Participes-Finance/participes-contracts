import { expect } from "chai";
import { ethers } from "hardhat";
import { advanceBlock, advanceTime, advanceTimeAndBlock, latest } from "../utilities";

describe("ve", function () {
  let token;
  let rt;
  let ve_underlying;
  let ve, ve_dist;
  let owner, farmer1, farmer2;
  let ve_underlying_amount = ethers.BigNumber.from("1000000000000000000000");
  let rewardToken1;
  let rewardToken2;

  beforeEach(async function () {
    [owner, farmer1, farmer2] = await ethers.getSigners();

    token = await ethers.getContractFactory("Token");
    rt = await ethers.getContractFactory("ERC20Mock");
    const vecontract = await ethers.getContractFactory("contracts/governance/ve.sol:ve");
    const ve_dist_contract = await ethers.getContractFactory("contracts/governance/ve_dist.sol:ve_dist");

    ve_underlying = await token.deploy("VE", "VE", 18, owner.address); // PARTS token
    await ve_underlying.deployed();

    rewardToken1 = await rt.deploy("Token1", "RT1", ve_underlying_amount);
    await rewardToken1.deployed();
    rewardToken2 = await rt.deploy("Token2", "RT2", ve_underlying_amount); // 1 mill supply cap each
    await rewardToken2.deployed();

    ve = await vecontract.deploy(ve_underlying.address); // xPARTS fNFT minting contract
    await ve.deployed();

    ve_dist = await ve_dist_contract.deploy(ve.address, [rewardToken1.address, rewardToken2.address]);
    await ve_dist.deployed();
  });

  it("claim rewards", async function () {
    await ve_underlying.connect(farmer1).approve(ve.address, ve_underlying_amount);
    await rewardToken1.connect(farmer1).approve(ve_dist.address, ve_underlying_amount);
    await rewardToken2.connect(farmer1).approve(ve_dist.address, ve_underlying_amount);

    // await ve_underlying.mint(owner.address, ve_underlying_amount);
    await ve_underlying.mint(farmer1.address, ve_underlying_amount);
    // await ve_underlying.mint(farmer2.address, ve_underlying_amount);

    const startTime = await latest();
    const lockDuration = 10 * 7 * 24 * 3600; // 10 weeks

    // Balance should be zero before and 1 after creating the lock
    expect(await ve.balanceOf(farmer1.address)).to.equal(0);
    await ve.connect(farmer1).create_lock(ve_underlying_amount, lockDuration); 
    expect(await ve.ownerOf(1)).to.equal(farmer1.address);
    expect(await ve.balanceOf(farmer1.address)).to.equal(1);

    // send rewards to reward distributor
    await rewardToken1.transfer(ve_dist.address, ve_underlying_amount);
    await rewardToken2.transfer(ve_dist.address, ve_underlying_amount);
    expect(await rewardToken1.balanceOf(ve_dist.address)).to.equal(ve_underlying_amount);
    expect(await rewardToken2.balanceOf(ve_dist.address)).to.equal(ve_underlying_amount);

    console.log("before")
    console.log("user_point_epoch: ", (await ve.user_point_epoch(1)).toNumber());
    console.log("time cursor of tokenId 1: ", (await ve_dist.time_cursor_of(1)).toNumber());
    console.log("user_point: ", await ve.user_point_history(1, 1));
    console.log("user_point.ts: ", ((await ve.user_point_history(1, 1)).ts).toNumber());

    advanceTimeAndBlock(2 * 7 * 24 * 3600); // wait 10 weeks
    advanceBlock();
    const endTime = await latest();
    console.log("lock percentage: ", (endTime - startTime)/lockDuration);

    // update last token claim times 
    await ve_dist.checkpoint_token();
    await ve_dist.checkpoint_total_supply();

    // check for claimables
    console.log("after")
    console.log("user_point_epoch: ", (await ve.user_point_epoch(1)).toNumber());
    console.log("time cursor of tokenId 1: ", (await ve_dist.time_cursor_of(1)).toNumber());
    console.log("user_point: ", await ve.user_point_history(1, 2));
    console.log("user_point.ts: ", ((await ve.user_point_history(1, 2)).ts).toNumber());
    // console.log("balance of fNFT: ", (await ve.balanceOfNFT(1)).toNumber());

    // [TODO]: wrong amount of claimables?
    let claimables = await ve_dist.connect(farmer1).claimable(1);
    console.log(claimables)
    await ve_dist.claim(1);
    expect((await rewardToken1.balanceOf(farmer1.address))).to.greaterThan(0);
    expect((await rewardToken2.balanceOf(farmer1.address))).to.greaterThan(0);
  });

});
