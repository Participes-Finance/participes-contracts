module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()

  const token = await ethers.getContract("MockSushiToken");
  const firstToken = await ethers.getContract("ERC20Mock");
  
  const { address } = await deploy("MockMasterChef", {
    from: deployer,
    args: [token.address, deployer, "1000000000000000000000", "0", "0"],
    log: true,
    deterministicDeployment: false
  })

  const masterChef = await ethers.getContract("MockMasterChef");

  console.log("adding FirstToken as LP to MockMasterChef");
  (await masterChef.add(
    100,
    firstToken.address,
    true
  )).wait()

}

module.exports.tags = ["MockMasterChef"]
module.exports.dependencies = ["MockSushiToken", "ERC20Mock"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
