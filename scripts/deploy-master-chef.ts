import { Contract, ContractFactory, Overrides, providers } from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  unit,
  rpc,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import YokaiMasterChef from "../artifacts/contracts/YokaiMasterChef.sol/YokaiMasterChef.json";
import Ownable from "../artifacts/@openzeppelin/contracts/access/Ownable.sol/Ownable.json";

import { yokContractName } from "./config";

type TransactionResponse = providers.TransactionResponse;

interface IOwnable extends Contract {
  transferOwnership(
    newOwner: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

const { FACTORY_ADDRESS } = process.env;
if (FACTORY_ADDRESS == null) {
  console.log("process.env.FACTORY_ADDRESS is required");
  process.exit(1);
}

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const [yokAndMonsterTxReceipts, transactionSubmitter] = await Promise.all([
    TransactionSubmitter.loadReceipts(
      `deploy-yok-and-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    ),
    TransactionSubmitter.newWithHistory(
      `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    ),
  ]);

  const yokTxReceipt = yokAndMonsterTxReceipts[`Deploy ${yokContractName}`];
  if (yokTxReceipt == null) {
    throw new Error("Failed to get YOK address");
  }
  const yokAddress = yokTxReceipt.contractAddress;
  const yok = new Contract(yokAddress, Ownable.abi, deployer) as IOwnable;

  const monsterTxReceipt = yokAndMonsterTxReceipts[`Deploy MonsterToken`];
  if (monsterTxReceipt == null) {
    throw new Error("Failed to get MONSTER address");
  }
  const monsterAddress = monsterTxReceipt.contractAddress;
  const monster = new Contract(
    monsterAddress,
    Ownable.abi,
    deployer,
  ) as IOwnable;

  const currentBlockNum = await rpc.getBlockNumber();
  console.log("Current Block Number:", currentBlockNum);

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy YokaiMasterChef`,
    () => {
      const implementationFactory = new ContractFactory(
        YokaiMasterChef.abi,
        YokaiMasterChef.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        yokAddress,
        monsterAddress,
        unit(20),
        currentBlockNum,
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const masterChefAddress = receipt.contractAddress;
  console.log(`    YokaiMasterChef address:`, masterChefAddress);

  await transactionSubmitter.submitAndWait(
    `Transfer YOK ownership to YokaiMasterChef`,
    () => {
      return yok.transferOwnership(masterChefAddress, txOverrides);
    },
  );

  await transactionSubmitter.submitAndWait(
    `Transfer MONSTER ownership to YokaiMasterChef`,
    () => {
      return monster.transferOwnership(masterChefAddress, txOverrides);
    },
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
