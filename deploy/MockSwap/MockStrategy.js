module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()

  const masterChef = await ethers.getContract("MockMasterChef");
  const lp = await ethers.getContract("ERC20Mock");
  const rewardToken = await ethers.getContract("MockSushiToken");
  const masterChefV2 = await ethers.getContract("MasterChefV2");

  console.log("deploying ExampleStrategy");
  const { stratAddr } = await deploy("ExampleStrategy", {
    from: deployer,
    args: [rewardToken.address, masterChef.address, masterChefV2.address, lp.address, 0],
    log: true,
    deterministicDeployment: false
  })

  strat = await ethers.getContract("ExampleStrategy");

  console.log("adding LP token to MasterChefV2");
  console.log(lp.address);
  await (await masterChefV2.add(
    "100", 
    lp.address, 
    "0x0000000000000000000000000000000000000000",
    strat.address,
    "500" // 5 basis points fee (0.05% or 500/10000)
  )).wait();

}

module.exports.tags = ["ExampleStrategy"]
module.exports.dependencies = ["MockMasterChef", "MockSushiToken", "MasterChefV2", "ERC20Mock"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
