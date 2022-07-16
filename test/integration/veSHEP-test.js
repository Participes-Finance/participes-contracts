//[TODO]: Modify test suite for vePARTS and fee distribution
const Utils = require("./utils");

// const { send } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { givenProvider } = require("web3");

const IERC20 = artifacts.require("contracts/interfaces/IERC20.sol:IERC20");
const VePARTS = artifacts.require("vePARTS");
const FeeDistributor = artifacts.require("FeeDistributor");
const ERC20Mock = artifacts.require("ERC20Mock");

describe("vePARTS token model test", function() {
  let accounts;
  let underlying, wavax;

  let underlyingWhale = "0x773c2C197fb05034c2Aa523696D5caa6ACf149Ee";
  let underlyingWhale1 = "0x211Ee0129A67e7D44514152eB43D9f31103Ac46B"; // both underlyings are avax whales
  let partsWhale = "0x3829E0A5a6C50292ee65426313E60Eb4577240F1";
  let mockStrategy = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"; // stand-in for a strategy contract for Participes
  let stratToken; // mock reward token from a strategy

  let governance;
  let farmer1, farmer2;

  let vePARTS, feeDistributor, avaxDistributor;

  async function deployContracts(){
    underlying = await ERC20Mock.new("Partserd", "PARTS", BigNumber(1000*1E18), {from: partsWhale});
    underlying.transfer(underlyingWhale, BigNumber(20*1E18), {from: partsWhale});
    underlying.transfer(underlyingWhale1, BigNumber(10*1E18), {from: partsWhale});
    stratToken = await ERC20Mock.new("Mock Token", "MOCK", BigNumber(1000*1E18), {from: governance});
    stratBalance = await stratToken.balanceOf(governance);
    console.log("gov stratToken balance: " + stratBalance)
    await stratToken.transfer(mockStrategy, stratBalance, {from: governance})

  }

  async function setupContracts(underlying, governance) {
    vePARTS = await VePARTS.new(underlying.address, "vePARTS", "vePARTS", "vePARTS_1.0.0", {from: governance});
    const startTime = new Date();
    console.log('start time: ', startTime.getTime());
    // avaxDistributor = await AvaxDistributor.new(vePARTS.address, Math.floor(startTime.getTime() / 1000), wavax.address, governance, governance, {from: governance});
    // We set WAVAX as the token to be distributed by fee-distributer for test cases
    feeDistributor = await FeeDistributor.new(vePARTS.address, Math.floor(startTime.getTime() / 1000), [stratToken.address], governance, governance, {from: governance});

    // await avaxDistributor.commit_admin(feeDistributor.address, {from: governance});
    // await avaxDistributor.apply_admin({from: governance});

    console.log('voting escrow address: ', vePARTS.address);
    console.log('voting_escrow', await feeDistributor.voting_escrow());
    console.log('tokens', await feeDistributor.tokens(0));
    console.log('token_last_balances', (await feeDistributor.token_last_balances(0)).toString());
    console.log('last_token_times', (await feeDistributor.last_token_times(0)).toString());

    // feeDistributor.checkpoint_token({from: governance});
  }

  async function impersonates(targetAccounts){
    console.log("Impersonating...");
    for(i = 0; i < targetAccounts.length ; i++){
      console.log(targetAccounts[i]);
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [
          targetAccounts[i]
        ]
      });
    }
  }

  // async function setupExternalContracts() {
  //   // underlying = await IERC20.at(partsAddress);
  //   // console.log("Fetching Underlying at: ", underlying.address);

  //   stratToke = await IERC20.at(wavaxAddress);
  //   console.log("Fetching Wrapped Avax at: ", wavax.address);
  // }

  async function setupBalance() {
    console.log('setupBalance1');
    let etherGiver = accounts[9];
    console.log('etherGiver: ', etherGiver);
    console.log('setupBalance2');

    let farmerBalance = await underlying.balanceOf(underlyingWhale);
    console.log('farmerBalance:', farmerBalance.toString());
    Utils.assertBNGt(farmerBalance, 0);
    await underlying.transfer(farmer1, farmerBalance, {from: underlyingWhale});

    farmerBalance = await underlying.balanceOf(underlyingWhale1);
    console.log('farmerBalance2:', farmerBalance.toString());
    Utils.assertBNGt(farmerBalance, 0);
    await underlying.transfer(farmer2, farmerBalance, {from: underlyingWhale1});
  }

  // async function setupPartsFeeBalance(balanceToDistribute) {
  //   let partsWhaleBalance = await underlying.balanceOf(partsWhale);
  //   console.log('partsWhaleBalance:', partsWhaleBalance.toString());
  //   Utils.assertBNGt(partsWhaleBalance, 0);

  //   await underlying.transfer(feeDistributor.address, balanceToDistribute, {from: partsWhale});
  //   let partsFeeBalance = await underlying.balanceOf(feeDistributor.address);
  //   console.log('parts balance for fee distributor:', partsFeeBalance.toString());
  //   Utils.assertBNGt(partsFeeBalance, 0);
  // }

  async function setupFeeBalance(balanceToDistribute) {
    let stratBalance = await stratToken.balanceOf(mockStrategy);
    console.log('stratBalance:', stratBalance.toString());
    Utils.assertBNGt(stratBalance, 0);

    await stratToken.transfer(feeDistributor.address, balanceToDistribute, {from: mockStrategy});
    let stratFeeBalance = await stratToken.balanceOf(feeDistributor.address);
    console.log('strat reward token balance for fee distributor:', stratFeeBalance.toString());
    Utils.assertBNGt(stratBalance, 0);
  }

  async function lockPARTS(farmer, underlying, balance, unlock_time) {
    await vePARTS.create_lock(balance, unlock_time, {from: farmer});
  }

  before(async function () {
    accounts = await web3.eth.getAccounts();
    governance = accounts[0];

    farmer1 = accounts[1];
    farmer2 = accounts[2];

    await impersonates([underlyingWhale, underlyingWhale1, partsWhale, mockStrategy]);
    await deployContracts();

    // await setupExternalContracts();

    await setupContracts(underlying, governance);

    await setupBalance();
  });

  describe("vePARTS test pass", function () {
    it("User earns vePARTS", async function () {
      let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
      console.log('farmerOldBalance: ', farmerOldBalance.toString());

      var myDate = "30-06-2022"; // [TODO]: make lock time not fixed
      myDate = myDate.split("-");
      var newDate = new Date( myDate[2], myDate[1] - 1, myDate[0]);
      console.log("timestamp: ", newDate.getTime());

      await underlying.approve(vePARTS.address, farmerOldBalance, {from: farmer1});

      await lockPARTS(farmer1, underlying, farmerOldBalance, newDate.getTime() / 1000);

      let farmerShareBalance = new BigNumber(await vePARTS.balanceOf(farmer1)).toFixed();
      console.log('farmerShareBalance: ', farmerShareBalance.toString());
    })
  })

  describe("fee distributor test pass", function () {
    it("vePARTS holders earn fees from Strategy", async function () {
      let farmerShareBalance = new BigNumber(await vePARTS.balanceOf(farmer1)).toFixed();
      console.log('farmerShareBalance: ', farmerShareBalance.toString());

      // lock parts for farmer2
      let farmerOldBalance2 = new BigNumber(await underlying.balanceOf(farmer2));
      console.log('farmerOldBalance2: ', farmerOldBalance2.toString());

      var myDate = "30-06-2022";
      myDate = myDate.split("-");
      var newDate = new Date( myDate[2], myDate[1] - 1, myDate[0]);
      console.log("timestamp: ", newDate.getTime());

      await underlying.approve(vePARTS.address, farmerOldBalance2, {from: farmer2});

      await lockPARTS(farmer2, underlying, farmerOldBalance2, newDate.getTime() / 1000);

      let farmerShareBalance2 = new BigNumber(await vePARTS.balanceOf(farmer2)).toFixed();
      console.log('farmerShareBalance2: ', farmerShareBalance2.toString());

      // send fees to distributors
      await setupFeeBalance("10" + "000000000000000000");
      // await feeDistributor.checkpoint_token({from: governance});

      // wait for more than 1 week
      // console.log(Date.now());
      console.log("before timestamp: ", (await feeDistributor.get_timestamp()).toString());
      await Utils.waitHours(24 * 20 + 10);
      await Utils.advanceNBlock((24 * 20 + 10) * 40);
      console.log("after timestamp: ", (await feeDistributor.get_timestamp()).toString());

      console.log('voting escrow address: ', vePARTS.address);
      console.log('voting_escrow', await feeDistributor.voting_escrow());
      console.log('tokens', await feeDistributor.tokens(0));
      console.log('token_last_balances', (await feeDistributor.token_last_balances(0)).toString());
      console.log('last_token_times', (await feeDistributor.last_token_times(0)).toString());
      console.log('time_cursor', (await feeDistributor.time_cursor()).toString());
      console.log('can_checkpoint_token', await feeDistributor.can_checkpoint_token());

      await feeDistributor.toggle_allow_checkpoint_token({from: governance});
      await console.log(await (await web3.eth.getBlock("")).timestamp)
      await Utils.waitHours(24 * 3); // [TODO]: last_token_time gets set in March 13 when it's March 11 -> bcos of rounding?
      // this causes checkpoint_token to revert, and hence why we wait for 72 hours before calling it again
      await feeDistributor.checkpoint_token()

      // claim rewards for farmer1
      let claimAmount;
      claimAmount = await feeDistributor.claim({from: farmer1});
      // console.log("farmer1 strat claim amount: ", claimAmount);
      let farmer1StratBalance = await stratToken.balanceOf(farmer1);
      console.log("farmer1PartsBalance: ", farmer1StratBalance.toString());

      // claim rewards for farmer2
      claimAmount = await feeDistributor.claim({from: farmer2});
      // console.log("farmer2 strat claim amount: ", claimAmount);
      let farmer2StratBalance = await stratToken.balanceOf(farmer2);
      console.log("farmer2PartsBalance: ", farmer2StratBalance.toString());

    })
  })
});