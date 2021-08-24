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

import Multicall from "../artifacts/contracts/libs/Multicall.sol/Multicall.json";

type TCallStatic = Contract["callStatic"];

interface IMulticallStaticMethods extends TCallStatic {
  getEthBalance(address: string, overrides?: CallOverrides): Promise<BigNumber>;
  aggregate(
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[BigNumber, any]>;
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
    `deploy-multicall${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Multicall`,
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
  console.log(`    Multicall address:`, multicallAddress);

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
    multicall.interface.encodeFunctionData(
      multicall.interface.functions["aggregate((address,bytes)[])"],
      [[[multicallAddress, callData]]],
    ),
  );

  console.log(
    "Balance:",
    BigNumber.from(
      (
        await multicall.callStatic.aggregate([[multicallAddress, callData]])
      )[1][0],
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
