module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()


  const { firstTokenAddr } = await deploy("ERC20Mock", {
    from: deployer,
    args: ["FirstToken", "FIRST", "69000000000000000000000"],
    log: true,
    deterministicDeployment: false
  })

}

module.exports.tags = ["FirstToken"]
// module.exports.dependencies = ["ERC20Mock"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
