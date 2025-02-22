import Big from 'big.js';
import {
  BridgeTokenStorageDeposit,
  NearConfig,
  TGas,
  TokenStorageDeposit,
} from './near';
import React from 'react';
import Timer from 'react-compound-timer';
import {
  Address,
  FunctionCallArgs,
  parseHexString,
} from '@aurora-is-near/engine';
import AbiCoder from 'web3-eth-abi';
import * as nearAPI from 'near-api-js';

const MinAccountIdLen = 2;
const MaxAccountIdLen = 64;
const ValidAccountRe = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const OneNear = Big(10).pow(24);
export const OneEth = Big(10).pow(18);
export const OneUSDC = Big(10).pow(6);
const AccountSafetyMargin = OneNear.div(2);
export const Zero64 = '0'.repeat(64);

export const Loading = (
  <span
    className="spinner-grow spinner-grow-sm me-1"
    role="status"
    aria-hidden="true"
  />
);

export function isValidAccountId(accountId) {
  return (
    accountId &&
    accountId.length >= MinAccountIdLen &&
    accountId.length <= MaxAccountIdLen &&
    accountId.match(ValidAccountRe)
  );
}

const toCamel = (s) => {
  return s.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace('-', '').replace('_', '');
  });
};

const isArray = function (a) {
  return Array.isArray(a);
};

const isObject = function (o) {
  return o === Object(o) && !isArray(o) && typeof o !== 'function';
};

export const keysToCamel = function (o) {
  if (isObject(o)) {
    const n = {};

    Object.keys(o).forEach((k) => {
      n[toCamel(k)] = keysToCamel(o[k]);
    });

    return n;
  } else if (isArray(o)) {
    return o.map((i) => {
      return keysToCamel(i);
    });
  }

  return o;
};

export const bigMin = (a, b) => {
  if (a && b) {
    return a.lt(b) ? a : b;
  }
  return a || b;
};

export const bigToString = (b, p, len) => {
  if (b === null) {
    return '???';
  }
  let s = b.toFixed();
  let pos = s.indexOf('.');
  p = p || 6;
  len = len || 7;
  if (pos > 0) {
    let ap = Math.min(p, Math.max(len - pos, 0));
    if (ap > 0) {
      ap += 1;
    }
    if (pos + ap < s.length) {
      s = s.substring(0, pos + ap);
    }
  } else {
    pos = s.length;
  }
  for (let i = pos - 4; i >= 0; i -= 3) {
    s = s.slice(0, i + 1) + ',' + s.slice(i + 1);
  }

  if (s === '0.000000' && p === 6 && len === 7) {
    return '<0.000001';
  }

  return s;
};

export const displayNear = (balance) =>
  balance ? (
    <>
      {bigToString(balance.div(OneNear))}{' '}
      <span className="text-secondary">NEAR</span>
    </>
  ) : (
    '???'
  );

export const dateToString = (d) => {
  return d.toLocaleString('en-us', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const displayTime = (d) => {
  return d.toLocaleString();
};

export const availableNearBalance = (account) => {
  if (account && !account.loading && account.state) {
    let balance = Big(account.state.amount).sub(
      Big(account.state.storage_usage).mul(Big(NearConfig.storageCostPerByte))
    );
    if (balance.gt(AccountSafetyMargin)) {
      return balance.sub(AccountSafetyMargin);
    }
  }
  return Big(0);
};

export const isoDate = (d) =>
  d ? new Date(d).toISOString().substring(0, 10) : '';

export const formatTimer = () => (
  <React.Fragment>
    <Timer.Days
      formatValue={(v) => (v > 1 ? `${v} days ` : v ? `1 day ` : '')}
    />
    <Timer.Hours />:
    <Timer.Minutes formatValue={(v) => `${v}`.padStart(2, '0')} />
    :
    <Timer.Seconds formatValue={(v) => `${v}`.padStart(2, '0')} />
  </React.Fragment>
);

export const isBridgeToken = (tokenAccountId) => {
  return tokenAccountId.endsWith('.bridge.near');
};

export const tokenStorageDeposit = async (tokenAccountId) => {
  return isBridgeToken(tokenAccountId)
    ? BridgeTokenStorageDeposit
    : TokenStorageDeposit;
};

export const toAddress = (address) => {
  return typeof address === 'string'
    ? Address.parse(address).unwrapOrElse(() => Address.zero())
    : address;
};

export const buildInput = (abi, methodName, params) => {
  const abiItem = abi.find((a) => a.name === methodName);
  if (!abiItem) {
    return null;
  }

  return AbiCoder.encodeFunctionCall(abiItem, params);
};

export const decodeOutput = (abi, methodName, buffer) => {
  const abiItem = abi.find((a) => a.name === methodName);
  if (!abiItem) {
    return null;
  }
  return AbiCoder.decodeParameters(
    abiItem.outputs,
    `0x${buffer.toString('hex')}`
  );
};

export function prepareInput(args) {
  if (typeof args === 'undefined') return Buffer.alloc(0);
  if (typeof args === 'string') return Buffer.from(parseHexString(args));
  return Buffer.from(args);
}

export function auroraCallAction(contract, input) {
  let args = new FunctionCallArgs(
    contract.toBytes(),
    prepareInput(input)
  ).encode();

  const action = nearAPI.transactions.functionCall(
    'call',
    args,
    TGas.mul(150).toFixed(0),
    1
  );

  return ['aurora', action];
}

export function parseAuroraPool(
  decodedRes,
  nep141A,
  nep141B,
  Erc20A,
  Erc20B,
  shares = undefined,
  fee = 30
) {
  const Afirst = Number(Erc20A) < Number(Erc20B);

  const token1Supply = decodedRes.reserve0;
  const token2Supply = decodedRes.reserve1;

  return {
    fromAurora: true,
    fee: fee,
    shares: shares,
    id: `aurora-${nep141A}-${nep141B}`,
    token0_price: undefined,
    supplies: {
      [nep141A]: Afirst ? token1Supply : token2Supply,
      [nep141B]: Afirst ? token2Supply : token1Supply,
    },
  };
}
