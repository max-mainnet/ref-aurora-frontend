import React, { useEffect, useState, useCallback } from 'react';
import { NearConfig, TGas, useAurora, useNear } from '../../data/near';
import { useErc20Balances } from '../../data/aurora/token';
import { useErc20AllowanceForDex } from '../../data/aurora/dex';
import {
  OneNear,
  OneEth,
  OneUSDC,
  toAddress,
  buildInput,
  decodeOutput,
  auroraCallAction,
} from '../../data/utils';
import Big from 'big.js';
import { useTokens } from '../../data/aurora/tokenList';
import './Dashboard.scss';
import * as nearAPI from 'near-api-js';
import { Erc20Abi } from '../../abi/erc20';
import { UniswapRouterAbi } from '../../abi/IUniswapV2Router02';

import { UniswapPairAbi } from '../../abi/IUniswapV2Pair';

import { useAccount } from '../../data/account';
import { AccountID, parseHexString } from '@aurora-is-near/engine';
import { KeyPair } from 'near-api-js';

const wNEAR = NearConfig.wrapNearAccountId;
const USDC = NearConfig.usdcAccountId;
const trisolaris = NearConfig.trisolarisAddress;

const pairAdd = NearConfig.pairAdd;

const fetchBalance = async (aurora, address) => {
  return Big((await aurora.getBalance(toAddress(address))).unwrap());
};

export default function Dashboard(props) {
  const aurora = useAurora();
  const near = useNear();
  const account = useAccount();
  const address = props.address;

  const [balance, setBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wNearAddr, setwNearAddr] = useState(null);

  const [USDCAddr, setUSDCAddr] = useState(null);

  const tokens = useTokens();

  const erc20Balances = useErc20Balances(address, tokens.tokenAddresses);

  const allowance = useErc20AllowanceForDex(address, wNearAddr, trisolaris);

  const allowanceUSDC = useErc20AllowanceForDex(address, USDCAddr, trisolaris);

  const getErc20Addr = useCallback(
    async (nep141) => {
      return (
        await aurora.getAuroraErc20Address(new AccountID(nep141))
      ).unwrap();
    },
    [aurora]
  );

  const getReserves = useCallback(async (aurora, address) => {
    const input = buildInput(UniswapPairAbi, 'getReserves', []);

    return (
      await aurora.view(toAddress(address), toAddress(pairAdd), 0, input)
    ).unwrap();
  }, []);

  const showAllAuroraKeys = useCallback(async () => {
    if (!near || !near.walletConnection) return;

    const nearAccount = await near.walletConnection.account();
    const allKeys = await nearAccount.getAccessKeys();

    const auroraKeys = allKeys.filter(
      (item) =>
        item.access_key.permission !== 'FullAccess' &&
        item.access_key.permission.FunctionCall.receiver_id === 'aurora'
    );

    console.log(auroraKeys);
  }, [near]);

  useEffect(() => {
    if (!aurora || !address) {
      return;
    }
    showAllAuroraKeys();

    fetchBalance(aurora, address).then((b) => {
      setBalance(b);
      setLoading(false);
    });

    getErc20Addr(wNEAR).then(setwNearAddr);

    getErc20Addr(USDC).then(setUSDCAddr);

    getReserves(aurora, address);
  }, [address, aurora, getErc20Addr, getReserves, showAllAuroraKeys, near]);

  const sortedErc20Balances = erc20Balances
    ? Object.entries(erc20Balances).filter(([t, b]) => b && Big(b).gt(0))
    : [];

  sortedErc20Balances.sort(([t1, a], [t2, b]) => b.cmp(a));

  const depositToken = async (e, token, amount, unit) => {
    e.preventDefault();
    setLoading(true);

    const actions = [
      [
        token,
        nearAPI.transactions.functionCall(
          'ft_transfer_call',
          {
            receiver_id: NearConfig.contractName,
            amount: Big(amount).mul(unit).toFixed(0),
            memo: '',
            msg: address.substring(2),
          },
          TGas.mul(70).toFixed(0),
          1
        ),
      ],
    ];

    await near.sendTransactions(actions);
  };

  const withdrawToken = async (e, token, amount, unit) => {
    e.preventDefault();
    setLoading(true);
    const input = buildInput(Erc20Abi, 'withdrawToNear', [
      `0x${Buffer.from(account.accountId, 'utf-8').toString('hex')}`,
      unit.mul(amount).round(0, 0).toFixed(0), // need to check decimals in real case
    ]);
    const erc20Addr = await getErc20Addr(token);
    if (erc20Addr) {
      const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();
      console.log(res);
      // return ['aurora', auroraCallAction(toAddress(erc20Addr), input)];
    }
  };

  const approve = async (e, token, amount, unit) => {
    e.preventDefault();

    const input = buildInput(Erc20Abi, 'increaseAllowance', [
      trisolaris,
      unit.mul(amount).round(0, 0).toFixed(0),
    ]);

    setLoading(true);

    const erc20Addr = await getErc20Addr(token);
    if (erc20Addr) {
      const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();
      setLoading(false);

      console.log(res);
    }
  };

  const swap = async (e, from, to, amount_in, amount_out) => {
    e.preventDefault();
    setLoading(true);

    const fromErc20 = await getErc20Addr(from);
    const toErc20 = await getErc20Addr(to);

    if (fromErc20 && toErc20) {
      const input = buildInput(UniswapRouterAbi, 'swapExactTokensForTokens', [
        OneNear.mul(amount_in).round(0, 0).toFixed(0), // need to check decimals in real case
        OneUSDC.mul(amount_out).round(0, 0).toFixed(0), // need to check decimals in real case
        [fromErc20.id, toErc20.id],
        address,
        (Math.floor(new Date().getTime() / 1000) + 60).toString(), // 60s from now
      ]);
      const res = (await aurora.call(toAddress(trisolaris), input)).unwrap();

      console.log(res);

      setLoading(false);
    }
  };

  const addLiquidity = async (e, A, B, amountA, amountB) => {
    const erc20A = await getErc20Addr(A);
    const erc20B = await getErc20Addr(B);

    if (erc20A && erc20B) {
      const input = buildInput(UniswapRouterAbi, 'addLiquidity', [
        erc20A.id,
        erc20B.id,
        OneNear.mul(amountA).round(0, 0).toFixed(0),
        OneUSDC.mul(amountB).round(0, 0).toFixed(0),
        0,
        0,
        address,
        (Math.floor(new Date().getTime() / 1000) + 60).toString(), // 60s from now
      ]);

      const res = (await aurora.call(toAddress(trisolaris), input)).unwrap();

      console.log(decodeOutput(UniswapRouterAbi, 'addLiquidity', res));
    }
  };

  const addFunctionCallKey = async () => {
    const nearAccount = await near.walletConnection.account();

    await nearAccount.addKey(
      KeyPair.fromRandom('ed25519').getPublicKey(),
      'aurora',
      'call',
      '2500000000000'
    );
  };

  const oneClickToAll = async (e, tokenA, tokenB, amountA) => {
    // check allowance compare allowance to account

    if (Big(allowance).lt(Big(amountA))) {
      await approve(
        e,
        tokenA,
        Number(amountA) - Number(allowance?.div(Big(OneNear)).toFixed(0)),
        OneNear
      );
    }

    // swap
    await swap(e, tokenA, tokenB, amountA, 0);

    // withdraw all
    await Promise.all(
      sortedErc20Balances.map((entry, i) => {
        const id = entry[0];

        const token = tokens.tokensByAddress[id];

        const nep141 = i === 0 ? 'wrap.testnet' : 'usdc.fakes.testnet';

        const balance = entry[1].div(Big(10).pow(token.decimals));

        return withdrawToken(
          e,
          nep141,
          balance > 10 ? balance - 2 : balance,
          i === 0 ? OneNear : OneUSDC
        );
      })
    );
  };

  return (
    <div>
      <div>Account: {address.toString()}</div>
      <div>
        Allowance for {wNEAR}:{' '}
        {allowance && allowance.div(Big(OneNear)).toFixed(0)}
      </div>

      <div>
        Allowance for {USDC}:{' '}
        {allowanceUSDC && allowanceUSDC.div(Big(OneUSDC)).toFixed(0)}
      </div>
      <div>
        <button
          className="btn btn-primary m-1"
          onClick={(e) => addFunctionCallKey()}
        >
          add function call key to aurora
        </button>

        <button
          className="btn btn-primary m-1"
          onClick={(e) => addLiquidity(e, wNEAR, USDC, 1, 1)}
        >
          add liquidity for 1 wnear and 1 USDC
        </button>

        <button
          className="btn btn-primary m-1"
          onClick={(e) => depositToken(e, USDC, 10, OneUSDC)}
        >
          Deposit 10 USDC
        </button>

        <button
          className="btn btn-primary m-1"
          onClick={(e) => depositToken(e, wNEAR, 10, OneNear)}
        >
          Deposit 10 wNEAR
        </button>
        <button
          className="btn btn-info m-1"
          onClick={(e) => approve(e, wNEAR, 10, OneNear)}
        >
          Approve 10 wNEAR on Trisolaris
        </button>

        <button
          className="btn btn-info m-1"
          onClick={(e) => approve(e, USDC, 10, OneUSDC)}
        >
          Approve 10 USDC on Trisolaris
        </button>
        <button
          className="btn btn-warning m-1"
          onClick={(e) => swap(e, wNEAR, USDC, 1, 0)}
        >
          Swap 1 wNEAR to USDC on Trisolaris test pair
        </button>
        <button
          className="btn btn-success m-1"
          onClick={(e) => withdrawToken(e, USDC, 1, OneUSDC)}
        >
          Withdraw 1 USDC
        </button>

        <button
          className="btn btn-success m-1"
          onClick={(e) => oneClickToAll(e, wNEAR, USDC, 1)}
        >
          one click to all
        </button>
      </div>
      <div>
        Balance: {loading ? 'Loading' : `${balance.div(OneEth).toFixed(6)} ETH`}
      </div>
      <div>
        ERC20 balances:
        <ul>
          {sortedErc20Balances?.map(([tokenAddress, balance]) => {
            const token = tokens.tokensByAddress[tokenAddress];

            return (
              <li key={`token-balance-${tokenAddress}`}>
                <img
                  className="token-icon me-1"
                  src={token.logoURI}
                  alt={token.symbol}
                />
                {token.symbol}:{' '}
                {balance
                  ? balance.div(Big(10).pow(token.decimals)).toFixed(6)
                  : balance}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
