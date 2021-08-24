import { BigNumber, CallOverrides, Contract, ContractFactory } from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  rpc,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import Multicall from "../artifacts/contracts/libs/Multicall2.sol/Multicall2.json";

type TCallStatic = Contract["callStatic"];

interface IMulticallStaticMethods extends TCallStatic {
  getEthBalance(address: string, overrides?: CallOverrides): Promise<BigNumber>;
  aggregate(
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[BigNumber, any]>;
  tryBlockAndAggregate(
    requireSuccess: boolean,
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[BigNumber, string, any]>;
}

interface IMulticall extends Contract, IMulticallStaticMethods {
  callStatic: IMulticallStaticMethods;
}

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

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-multicall2${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Multicall2`,
    () => {
      const implementationFactory = new ContractFactory(
        Multicall.abi,
        Multicall.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const multicallAddress = receipt.contractAddress;
  console.log(`    Multicall2 address:`, multicallAddress);

  const multicall = new Contract(
    multicallAddress,
    Multicall.abi,
    deployer,
  ) as IMulticall;

  console.log(
    "Balance:",
    (
      await multicall.callStatic.getEthBalance(deployerRecipientAddress)
    ).toString(),
  );

  const callData = multicall.interface.encodeFunctionData(
    multicall.interface.functions["getEthBalance(address)"],
    [deployerRecipientAddress],
  );

  console.log(
    "Balance:",
    BigNumber.from(
      (
        await multicall.callStatic.tryBlockAndAggregate(false, [
          [multicallAddress, callData],
        ])
      )[2][0],
    ).toString(),
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
