module.exports = async function ({ ethers, deployments, getNamedAccounts }) {
  const { deploy } = deployments

  const { deployer} = await getNamedAccounts()

  const parts = await ethers.getContract("PartsToken");
  const masterChef = await ethers.getContract("MasterChef");
  
  const { address } = await deploy("MasterChefV2", {
    from: deployer,
    log: true,
    deterministicDeployment: false
  })

  const { dummyAddr } = await deploy("ERC20Mock", {
    from: deployer,
    args: ["DUMMY", "DUM", 69],
    log: true,
    deterministicDeployment: false
  })

  const dummyToken = await ethers.getContract("ERC20Mock");
  console.log("dummy balance of deployer: ", await dummyToken.balanceOf(deployer));
  console.log("got dummy token!");
  const masterChefV2 = await ethers.getContract("MasterChefV2");

  console.log("initialize MasterChefV2 smart contract parameters... let the farmin' begin");
  console.log("this 1");
  await masterChefV2.initialize(parts.address, deployer, deployer);
  console.log("this 2");
  await masterChefV2.setMasterChef(masterChef.address, 0, "1000000000000000000000");

  console.log("this 3");
  await masterChef.add(100, dummyToken.address, 0, true);
  console.log("this 4");
  await dummyToken.approve(masterChefV2.address, 69);
  console.log("this 5");
  await masterChefV2.init(dummyToken.address);
  console.log("success!");
  console.log("masterChefV2.MASTER_CHEF: ", await masterChefV2.MASTER_CHEF());
  console.log("masterChefV2.MASTER_PID: ", await masterChefV2.MASTER_PID());
}

module.exports.tags = ["MasterChefV2"]
module.exports.dependencies = ["PartsToken", "MasterChef"]
// module.exports.dependencies = ["UniswapV2Factory", "UniswapV2Router02", "PartsToken"]
