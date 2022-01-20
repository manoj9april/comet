import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeploymentManager, Roots } from '../../plugins/deployment_manager/DeploymentManager';
import {
  Comet__factory,
  Comet,
  FaucetToken__factory,
  FaucetToken,
  ProxyAdmin,
  ProxyAdmin__factory,
  ERC20,
  SimplePriceFeed,
  SimplePriceFeed__factory,
  TransparentUpgradeableProxy__factory,
  TransparentUpgradeableProxy,
} from '../../build/types';
import { AssetInfoStruct, ConfigurationStruct } from '../../build/types/Comet';
import { BigNumberish } from 'ethers';
export { Comet } from '../../build/types';
import { DeployedContracts, CometConfigurationOverrides } from './index';

async function makeToken(
  deploymentManager: DeploymentManager,
  amount: number,
  name: string,
  decimals: number,
  symbol: string
): Promise<FaucetToken> {
  return await deploymentManager.deploy<
    FaucetToken,
    FaucetToken__factory,
    [string, string, number, string]
  >('test/FaucetToken.sol', [
    (BigInt(amount) * 10n ** BigInt(decimals)).toString(),
    name,
    decimals,
    symbol,
  ]);
}

async function makePriceFeed(
  deploymentManager: DeploymentManager,
  initialPrice: number,
  decimals: number
): Promise<SimplePriceFeed> {
  return await deploymentManager.deploy<
    SimplePriceFeed,
    SimplePriceFeed__factory,
    [number, number]
  >('test/SimplePriceFeed.sol', [initialPrice * 1e8, decimals]);
}

// TODO: Support configurable assets as well?
export async function deployDevelopmentComet(
  deploymentManager: DeploymentManager,
  deployProxy: boolean = true,
  configurationOverrides: CometConfigurationOverrides = {}
): Promise<DeployedContracts> {
  const [governor, pauseGuardian] = await deploymentManager.hre.ethers.getSigners();

  let baseToken = await makeToken(deploymentManager, 1000000, 'DAI', 18, 'DAI');
  let asset0 = await makeToken(deploymentManager, 2000000, 'GOLD', 8, 'GOLD');
  let asset1 = await makeToken(deploymentManager, 3000000, 'SILVER', 10, 'SILVER');

  let baseTokenPriceFeed = await makePriceFeed(deploymentManager, 1, 8);
  let asset0PriceFeed = await makePriceFeed(deploymentManager, 0.5, 8);
  let asset1PriceFeed = await makePriceFeed(deploymentManager, 0.05, 8);

  let assetInfo0 = {
    asset: asset0.address,
    borrowCollateralFactor: (1e18).toString(),
    liquidateCollateralFactor: (1e18).toString(),
    liquidationFactor: (0.95e18).toString(),
    supplyCap: (1000000e8).toString(),
    priceFeed: asset0PriceFeed.address,
    scale: (1e8).toString(),
  };

  let assetInfo1 = {
    asset: asset1.address,
    borrowCollateralFactor: (0.5e18).toString(),
    liquidateCollateralFactor: (0.5e18).toString(),
    liquidationFactor: (0.9e18).toString(),
    supplyCap: (500000e10).toString(),
    priceFeed: asset1PriceFeed.address,
    scale: (1e10).toString(),
  };

  let configuration = {
    ...{
      governor: await governor.getAddress(),
      pauseGuardian: await pauseGuardian.getAddress(),
      baseToken: baseToken.address,
      baseTokenPriceFeed: baseTokenPriceFeed.address,
      kink: (8e17).toString(), // 0.8
      perYearInterestRateBase: (5e15).toString(), // 0.005
      perYearInterestRateSlopeLow: (1e17).toString(), // 0.1
      perYearInterestRateSlopeHigh: (3e18).toString(), // 3.0
      reserveRate: (1e17).toString(), // 0.1
      trackingIndexScale: (1e15).toString(), // XXX add 'exp' to scen framework?
      baseTrackingSupplySpeed: 0, // XXX
      baseTrackingBorrowSpeed: 0, // XXX
      baseMinForRewards: 1, // XXX
      baseBorrowMin: 1, // XXX
      targetReserves: 0, // XXX
      absorbBaseGas: 30000, // XXX
      absorbTip: 1, // XXX
      assetInfo: [assetInfo0, assetInfo1],
    },
    ...configurationOverrides,
  };

  const comet = await deploymentManager.deploy<Comet, Comet__factory, [ConfigurationStruct]>(
    'Comet.sol',
    [configuration]
  );

  let proxy = null;
  if (deployProxy) {
    let proxyAdminArgs: [] = [];
    let proxyAdmin = await deploymentManager.deploy<ProxyAdmin, ProxyAdmin__factory, []>(
      'vendor/proxy/ProxyAdmin.sol',
      proxyAdminArgs
    );

    proxy = await deploymentManager.deploy<
      TransparentUpgradeableProxy,
      TransparentUpgradeableProxy__factory,
      [string, string, string]
    >('vendor/proxy/TransparentUpgradeableProxy.sol', [
      comet.address,
      proxyAdmin.address,
      (await comet.populateTransaction.XXX_REMOVEME_XXX_initialize()).data,
    ]);

    await deploymentManager.setRoots({ TransparentUpgradeableProxy: proxy.address } as Roots);
  }

  return {
    comet,
    proxy,
    tokens: [baseToken, asset0, asset1],
  };
}
