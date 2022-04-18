import * as nearAPI from 'near-api-js';
import { singletonHook } from 'react-singleton-hook';
import Big from 'big.js';
import { Engine } from '@aurora-is-near/engine/lib/engine';
import { useEffect, useState } from 'react';

export const TGas = Big(10).pow(12);
export const MaxGasPerTransaction = TGas.mul(300);
export const StorageCostPerByte = Big(10).pow(19);
export const TokenStorageDeposit = StorageCostPerByte.mul(125);
export const BridgeTokenStorageDeposit = StorageCostPerByte.mul(1250);

export const randomPublicKey = nearAPI.utils.PublicKey.from(
  'ed25519:8fWHD35Rjd78yeowShh9GwhRudRtLLsGCRjZtgPjAtw9'
);

export const IsMainnet = false;
const TestnetContract = 'aurora';
const TestNearConfig = {
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.near.org',
  archivalNodeUrl: 'https://rpc.testnet.internal.near.org',
  contractName: TestnetContract,
  walletUrl: 'https://wallet.testnet.near.org',
  storageCostPerByte: StorageCostPerByte,
  wrapNearAccountId: 'wrap.testnet',
  usdcAccountId: 'usdc.fakes.testnet',
  trisolarisAddress: '0x26ec2aFBDFdFB972F106100A3deaE5887353d9B9',
  auroraContractId: 'aurora',
  ethBridgeAddress: '0xe9217bc70b7ed1f598ddd3199e80b093fa71124f',
  erc20TokenAddressConfig: {
    'wrap.testnet': '0x8711C4728324C9b6264829a2fb92C83c870fd1BE',
    'usdt.fakes.testnet': '0x510c25DCE320749301Fdc4CAde5d0073fe50Ddd8',
  },
  pairAdd: '0x37401f53be96E28996d18A1964F47dF9e23b15D2',
};
const MainnetContract = 'aurora';
export const MainNearConfig = {
  networkId: 'mainnet',
  nodeUrl: 'https://rpc.mainnet.near.org',
  archivalNodeUrl: 'https://rpc.mainnet.internal.near.org',
  contractName: MainnetContract,
  walletUrl: 'https://wallet.near.org',
  storageCostPerByte: StorageCostPerByte,
  wrapNearAccountId: 'wrap.near',
  usdcAccountId: 'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
  ethBridgeAddress: '0xe9217bc70b7ed1f598ddd3199e80b093fa71124f',
  trisolarisAddress: '0x2cb45edb4517d5947afde3beabf95a582506858b',
  auroraContractId: 'aurora',
  erc20TokenAddressConfig: {},
  pairAdd: '',
};

export const NearConfig = IsMainnet ? MainNearConfig : TestNearConfig;
export const LsKey = NearConfig.contractName + ':v01:';

async function _initNear() {
  const keyStore = new nearAPI.keyStores.BrowserLocalStorageKeyStore();
  keyStore.reKey = () => {};
  const nearConnection = await nearAPI.connect(
    Object.assign({ deps: { keyStore } }, NearConfig)
  );
  const _near = {};

  _near.nearArchivalConnection = nearAPI.Connection.fromConfig({
    networkId: NearConfig.networkId,
    provider: {
      type: 'JsonRpcProvider',
      args: { url: NearConfig.archivalNodeUrl },
    },
    signer: { type: 'InMemorySigner', keyStore },
  });

  _near.keyStore = keyStore;
  _near.nearConnection = nearConnection;

  _near.walletConnection = new nearAPI.WalletConnection(
    nearConnection,
    'aurora'
  );
  _near.accountId = _near.walletConnection.getAccountId();
  _near.account = _near.walletConnection.account();

  _near.contract = new nearAPI.Contract(
    _near.account,
    NearConfig.contractName,
    {
      viewMethods: [],
      changeMethods: [],
    }
  );

  _near.fetchBlockHash = async () => {
    const block = await nearConnection.connection.provider.block({
      finality: 'final',
    });
    return nearAPI.utils.serialize.base_decode(block.header.hash);
  };

  _near.fetchBlockHeight = async () => {
    const block = await nearConnection.connection.provider.block({
      finality: 'final',
    });
    return block.header.height;
  };

  _near.fetchNextNonce = async () => {
    const accessKeys = await _near.account.getAccessKeys();
    return accessKeys.reduce(
      (nonce, accessKey) => Math.max(nonce, accessKey.access_key.nonce + 1),
      1
    );
  };

  _near.sendTransactions = async (items, callbackUrl) => {
    let [nonce, blockHash] = await Promise.all([
      _near.fetchNextNonce(),
      _near.fetchBlockHash(),
    ]);

    const transactions = [];
    let actions = [];
    let currentReceiverId = null;
    let currentTotalGas = Big(0);
    items.push([null, null]);
    items.forEach(([receiverId, action]) => {
      const actionGas =
        action && action.functionCall ? Big(action.functionCall.gas) : Big(0);
      const newTotalGas = currentTotalGas.add(actionGas);
      if (
        receiverId !== currentReceiverId ||
        newTotalGas.gt(MaxGasPerTransaction)
      ) {
        if (currentReceiverId !== null) {
          transactions.push(
            nearAPI.transactions.createTransaction(
              _near.accountId,
              randomPublicKey,
              currentReceiverId,
              nonce++,
              actions,
              blockHash
            )
          );
          actions = [];
        }
        currentTotalGas = actionGas;
        currentReceiverId = receiverId;
      } else {
        currentTotalGas = newTotalGas;
      }

      actions.push(action);
    });

    console.log(transactions[0].actions, actions);

    return await _near.walletConnection.requestSignTransactions(
      transactions,
      callbackUrl
    );
  };

  _near.archivalViewCall = async (blockId, contractId, methodName, args) => {
    args = args || {};
    const result = await _near.nearArchivalConnection.provider.query({
      request_type: 'call_function',
      account_id: contractId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      block_id: blockId,
    });

    return (
      result.result &&
      result.result.length > 0 &&
      JSON.parse(Buffer.from(result.result).toString())
    );
  };

  _near.aurora = new Engine(
    _near.walletConnection,
    keyStore,
    _near.account,
    NearConfig.networkId,
    NearConfig.auroraContractId
  );

  return _near;
}

const defaultNearPromise = Promise.resolve(_initNear());
export const useNearPromise = singletonHook(defaultNearPromise, () => {
  return defaultNearPromise;
});

const defaultNear = null;
export const useNear = singletonHook(defaultNear, () => {
  const [near, setNear] = useState(defaultNear);
  const _near = useNearPromise();

  useEffect(() => {
    _near.then(setNear);
  }, [_near]);

  return near;
});

const defaultAurora = null;
export const useAurora = singletonHook(defaultAurora, () => {
  const [aurora, setAurora] = useState(defaultAurora);
  const near = useNear();

  useEffect(() => {
    if (near) {
      setAurora(near.aurora);
    }
  }, [near]);

  return aurora;
});
