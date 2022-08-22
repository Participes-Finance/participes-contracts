module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()

  const parts = await ethers.getContract("PartsToken");
  
  const { address } = await deploy("ve", {
    from: deployer,
    args: [parts.address],
    log: true,
    deterministicDeployment: false
  })

  const ve = await ethers.getContract("ve");
  const mockSushi = await ethers.getContract("MockSushiToken");

  const { address2 } = await deploy("ve_dist", {
    from: deployer,
    args: [ve.address, [mockSushi.address]],
    log: true,
    deterministicDeployment: false
  })

}

module.exports.tags = ["ve"]
module.exports.dependencies = ["PartsToken"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
