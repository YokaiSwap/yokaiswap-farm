import { ContractFactory } from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  rpc,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import YOKVault from "../artifacts/contracts/YOKVault.sol/YOKVault.json";

import { yokContractName } from "./config";

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

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

  const [yokAndMonsterTxReceipts, masterChefTxReceipts, transactionSubmitter] =
    await Promise.all([
      TransactionSubmitter.loadReceipts(
        `deploy-yok-and-monster${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
      ),
      TransactionSubmitter.loadReceipts(
        `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      ),
      TransactionSubmitter.newWithHistory(
        `deploy-yok-vault${networkSuffix ? `-${networkSuffix}` : ""}.json`,
        Boolean(process.env.IGNORE_HISTORY),
      ),
    ]);

  const yokTxReceipt = yokAndMonsterTxReceipts[`Deploy ${yokContractName}`];
  if (yokTxReceipt == null) {
    throw new Error("Failed to get YOK address");
  }
  const yokAddress = yokTxReceipt.contractAddress;

  const monsterTxReceipt = yokAndMonsterTxReceipts[`Deploy MonsterToken`];
  if (monsterTxReceipt == null) {
    throw new Error("Failed to get MONSTER address");
  }
  const monsterAddress = monsterTxReceipt.contractAddress;

  const masterChefTxReceipt = masterChefTxReceipts[`Deploy YokaiMasterChef`];
  if (masterChefTxReceipt == null) {
    throw new Error("Failed to get YokaiMasterChef address");
  }
  const masterChefAddress = masterChefTxReceipt.contractAddress;

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy YOKVault`,
    () => {
      const implementationFactory = new ContractFactory(
        YOKVault.abi,
        YOKVault.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        yokAddress,
        monsterAddress,
        masterChefAddress,
        deployerRecipientAddress,
        deployerRecipientAddress,
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const yokVaultAddress = receipt.contractAddress;
  console.log(`    YOKVault address:`, yokVaultAddress);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
