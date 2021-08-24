import {
  BigNumber,
  BigNumberish,
  CallOverrides,
  Contract,
  ContractFactory,
  Overrides,
  providers,
  utils,
} from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";
import { Script, utils as ckbUtils } from "@ckb-lumos/base";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  rpc,
  unit,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import SUDTERC20Proxy from "../generated-artifacts/contracts/SudtERC20Proxy.json";
import StakingRewards from "../artifacts/contracts/StakingRewards.sol/StakingRewards.json";
import YokaiMasterChef from "../artifacts/contracts/YokaiMasterChef.sol/YokaiMasterChef.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IERC20StaticMethods extends TCallStatic {
  totalSupply(overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
}

interface IERC20 extends Contract, IERC20StaticMethods {
  callStatic: IERC20StaticMethods;
  transfer(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface IMasterChef extends Contract {
  add(
    allocPoint: BigNumberish,
    lpToken: string,
    stakingRewards: string,
    withUpdate: boolean,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface IStakingRewards extends Contract {
  notifyRewardAmount(
    reward: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

const { MEOW_SUDT_ID } = process.env;
if (MEOW_SUDT_ID == null) {
  console.log("process.env.MEOW_SUDT_ID is required");
  process.exit(1);
}
const meowSUDTID = MEOW_SUDT_ID;

const { FACTORY_ADDRESS } = process.env;
if (FACTORY_ADDRESS == null) {
  console.log("process.env.FACTORY_ADDRESS is required");
  process.exit(1);
}
const factoryAddress = FACTORY_ADDRESS;

const { WCKB_ADDRESS } = process.env;
if (WCKB_ADDRESS == null) {
  console.log("process.env.WCKB_ADDRESS is required");
  process.exit(1);
}
const wckbAddress = WCKB_ADDRESS;

function getPairAddress(addresses: [string, string]) {
  const [tokenAAddress, tokenBAddress] =
    addresses[0].toLowerCase() < addresses[1].toLowerCase()
      ? [addresses[0], addresses[1]]
      : [addresses[1], addresses[0]];
  const initCodeHash =
    "0x63a0795e9ce9291273519bb2edcd3edd1043cfa10fea99808b19f125f7c743a4";
  const salt = utils.solidityKeccak256(
    ["address", "address"],
    [tokenAAddress, tokenBAddress],
  );
  const offChainCalculatedPairAddress = utils.getCreate2Address(
    factoryAddress,
    salt,
    initCodeHash,
  );

  if (!isGodwoken) {
    return offChainCalculatedPairAddress;
  }

  return create2ContractAddressToGodwokenShortAddress(
    offChainCalculatedPairAddress,
  );
}

function create2ContractAddressToGodwokenShortAddress(
  ethAddress: string,
): string {
  if (!utils.isAddress(ethAddress)) {
    throw new Error("eth address format error!");
  }

  const creatorAccountId = Number(process.env.CREATOR_ACCOUNT_ID!);
  const creatorAccountIdLe = u32ToLittleEndian(creatorAccountId);

  const layer2Lock: Script = {
    code_hash: process.env.POLYJUICE_CONTRACT_CODE_HASH!,
    hash_type: "type",
    args:
      process.env.ROLLUP_TYPE_HASH! +
      creatorAccountIdLe.slice(2) +
      ethAddress.slice(2).toLowerCase(),
  };
  const scriptHash = ckbUtils.computeScriptHash(layer2Lock);
  const shortAddress = scriptHash.slice(0, 42);
  return utils.getAddress(shortAddress);
}

function u32ToLittleEndian(num: number): string {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num);
  return `0x${buf.toString("hex")}`;
}

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  let deployerRecipientAddress = deployerAddress;
  if (isGodwoken) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      await godwoker.getShortAddressByAllTypeEthAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerRecipientAddress);
  }

  const [masterChefTxReceipts, transactionSubmitter] = await Promise.all([
    TransactionSubmitter.loadReceipts(
      `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    ),
    TransactionSubmitter.newWithHistory(
      `deploy-meow-farm${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    ),
  ]);

  let receipt = await transactionSubmitter.submitAndWait(`Deploy MEOW`, () => {
    const implementationFactory = new ContractFactory(
      SUDTERC20Proxy.abi,
      SUDTERC20Proxy.bytecode,
      deployer,
    );
    const tx = implementationFactory.getDeployTransaction(
      "Meow Meow Meow",
      "MEOW",
      unit(100_000_000),
      meowSUDTID,
    );
    tx.gasPrice = txOverrides.gasPrice;
    tx.gasLimit = txOverrides.gasLimit;
    return deployer.sendTransaction(tx);
  });

  const meowAddress = receipt.contractAddress;
  console.log(`    MEOW address:`, meowAddress);

  const meow = new Contract(
    meowAddress,
    SUDTERC20Proxy.abi,
    deployer,
  ) as IERC20;

  console.log(
    "    Total supply:",
    (await meow.callStatic.totalSupply()).toString(),
  );

  console.log(
    "    Balance:",
    (await meow.callStatic.balanceOf(deployerRecipientAddress)).toString(),
  );

  const masterChefTxReceipt = masterChefTxReceipts["Deploy YokaiMasterChef"];
  if (masterChefTxReceipt == null) {
    throw new Error("Failed to get YokaiMasterChef address");
  }
  const masterChefAddress = masterChefTxReceipt.contractAddress;
  const masterChef = new Contract(
    masterChefAddress,
    YokaiMasterChef.abi,
    deployer,
  ) as IMasterChef;

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy MEOW StakingRewards`,
    () => {
      const implementationFactory = new ContractFactory(
        StakingRewards.abi,
        StakingRewards.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        deployerRecipientAddress,
        deployerRecipientAddress,
        meowAddress,
        masterChefAddress,
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );
  const stakingRewardsAddress = receipt.contractAddress;
  console.log(`    MEOW StakingRewards address:`, stakingRewardsAddress);
  const stakingRewards = new Contract(
    stakingRewardsAddress,
    StakingRewards.abi,
    deployer,
  ) as IStakingRewards;

  const pairAddress = getPairAddress([meowAddress, wckbAddress]);

  console.log(`MEOW-CKB-LP address:`, pairAddress);

  await transactionSubmitter.submitAndWait(`Add MEOW-CKB Farm`, () => {
    return masterChef.add(
      100,
      pairAddress,
      stakingRewardsAddress,
      false,
      txOverrides,
    );
  });

  await transactionSubmitter.submitAndWait(
    `Transfer 100,000 MEOW to StakingRewards`,
    () => meow.transfer(stakingRewardsAddress, unit(100_000), txOverrides),
  );

  await transactionSubmitter.submitAndWait(
    `Notify 100,000 reward amount for StakingRewards`,
    () => stakingRewards.notifyRewardAmount(unit(100_000), txOverrides),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
