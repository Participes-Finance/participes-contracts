 module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

  await deploy("MockSushiToken", {
    from: deployer,
    log: true,
    deterministicDeployment: false
  })
}

module.exports.tags = ["MockSushiToken"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02"]
