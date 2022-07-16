module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer, dev } = await getNamedAccounts()

  const parts = await ethers.getContract("PartsToken")
  
  const { address } = await deploy("MasterChef", {
    from: deployer,
    args: [parts.address, dev, dev, "1000000000000000000000", "0"],
    log: true,
    deterministicDeployment: false
  })

  if (await parts.owner() !== address) {
    // Transfer Parts Ownership to Chef
    console.log("Transfer Parts Ownership to Chef")
    await (await parts.transferOwnership(address)).wait()
  }

  const masterChef = await ethers.getContract("MasterChef")
  if (await masterChef.owner() !== dev) {
    // Transfer ownership of MasterChef to dev
    console.log("Transfer ownership of MasterChef to dev")
    await (await masterChef.transferOwnership(dev)).wait()
  }
}

module.exports.tags = ["MasterChef"]
module.exports.dependencies = ["PartsToken"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
