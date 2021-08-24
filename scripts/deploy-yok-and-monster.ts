import { ContractFactory } from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import MintableYokaiToken from "../artifacts/contracts/dev/MintableYokaiToken.sol/MintableYokaiToken.json";
import YokaiToken from "../artifacts/contracts/YokaiToken.sol/YokaiToken.json";
import MonsterToken from "../artifacts/contracts/MonsterToken.sol/MonsterToken.json";

import { isTestOrDev, yokContractName } from "./config";

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-yok-and-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy ${yokContractName}`,
    () => {
      const implementationFactory = new ContractFactory(
        (isTestOrDev ? MintableYokaiToken : YokaiToken).abi,
        (isTestOrDev ? MintableYokaiToken : YokaiToken).bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const yokAddress = receipt.contractAddress;
  console.log(`    ${yokContractName} address:`, yokAddress);

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy MonsterToken`,
    () => {
      const implementationFactory = new ContractFactory(
        MonsterToken.abi,
        MonsterToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(yokAddress);
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const monsterAddress = receipt.contractAddress;
  console.log(`    MonsterToken address:`, monsterAddress);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
