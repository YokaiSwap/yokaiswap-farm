import { ContractFactory } from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import MintableToken from "../artifacts/contracts/dev/MintableToken.sol/MintableToken.json";

import { tokens } from "./config";

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-dev-tokens${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  for (const [symbol, name] of Object.entries(tokens)) {
    await deployToken(name, symbol);
  }

  async function deployToken(name: string, symbol: string) {
    const receipt = await transactionSubmitter.submitAndWait(
      `Deploy ${symbol}`,
      () => {
        const implementationFactory = new ContractFactory(
          MintableToken.abi,
          MintableToken.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction(name, symbol);
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );

    const address = receipt.contractAddress;
    console.log(`    ${symbol} address:`, address);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
