module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()

  const parts = await ethers.getContract("PartsToken")
  
  const { address } = await deploy("MasterChef", {
    from: deployer,
    args: [parts.address, deployer, deployer, "1000000000000000000000", "0"],
    log: true,
    deterministicDeployment: false
  })

  const masterChef = await ethers.getContract("MasterChef");

  if (await parts.owner() !== masterChef.address) {
    // Transfer Parts Ownership to Chef
    console.log("Transfer Parts Ownership to Chef")
    await (await parts.transferOwnership(masterChef.address)).wait()
  }

  if (await masterChef.owner() !== deployer) {
    // Transfer ownership of MasterChef to deployer
    console.log("Transfer ownership of MasterChef to deployer")
    await (await masterChef.transferOwnership(deployer)).wait()
  }
}

module.exports.tags = ["MasterChef"]
module.exports.dependencies = ["PartsToken"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
