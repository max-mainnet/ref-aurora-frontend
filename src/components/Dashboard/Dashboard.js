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
  tokenStorageDeposit,
  decodeOutput,
} from '../../data/utils';
import Big from 'big.js';
import { useTokens } from '../../data/aurora/tokenList';
import './Dashboard.scss';
import * as nearAPI from 'near-api-js';
import { Erc20Abi } from '../../abi/erc20';
import { UniswapRouterAbi } from '../../abi/IUniswapV2Router02';

import { UniswapPairAbi } from '../../abi/IUniswapV2Pair';

import { useAccount } from '../../data/account';
import { AccountID, Address } from '@aurora-is-near/engine';

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

    console.log(typeof address === 'string');

    return (
      await aurora.view(toAddress(address), toAddress(pairAdd), 0, input)
    ).unwrap();
  }, []);

  useEffect(() => {
    if (!aurora || !address) {
      return;
    }

    fetchBalance(aurora, address).then((b) => {
      setBalance(b);
      setLoading(false);
    });

    getErc20Addr(wNEAR).then(setwNearAddr);

    getErc20Addr(USDC).then(setUSDCAddr);

    getReserves(aurora, address).then((res) => {
      console.log(res, decodeOutput(UniswapPairAbi, 'getReserves', res));
    });
  }, [address, aurora, getErc20Addr, getReserves]);

  const sortedErc20Balances = erc20Balances
    ? Object.entries(erc20Balances).filter(([t, b]) => b)
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

  const withdrawToken = async (e, token, amount) => {
    e.preventDefault();
    setLoading(true);
    const input = buildInput(Erc20Abi, 'withdrawToNear', [
      `0x${Buffer.from(account.accountId, 'utf-8').toString('hex')}`,
      OneUSDC.mul(amount).round(0, 0).toFixed(0), // need to check decimals in real case
    ]);
    const erc20Addr = await getErc20Addr(token);
    if (erc20Addr) {
      const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();
      console.log(res);
      setLoading(false);
    }
  };

  const approve = async (e, token, amount) => {
    e.preventDefault();

    const input = buildInput(Erc20Abi, 'increaseAllowance', [
      trisolaris,
      OneNear.mul(amount).round(0, 0).toFixed(0),
    ]);

    setLoading(true);

    const erc20Addr = await getErc20Addr(token);
    if (erc20Addr) {
      const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();
      console.log(res);
      setLoading(false);
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

  return (
    <div>
      <div>Account: {address.toString()}</div>
      <div>
        Allowance for {wNEAR}:{' '}
        {allowance && allowance.div(Big(OneNear)).toNumber()}
      </div>

      <div>
        Allowance for {USDC}:{' '}
        {allowanceUSDC && allowanceUSDC.div(Big(OneNear)).toNumber()}
      </div>
      <div>
        <button
          className="btn btn-primary m-1"
          onClick={(e) => addLiquidity(e, wNEAR, USDC, 1, 1)}
        >
          add liquidity for 1 wnear and 1 USDC
        </button>

        <button
          className="btn btn-primary m-1"
          onClick={(e) => depositToken(e, USDC, 1, OneUSDC)}
        >
          Deposit 1 USDC
        </button>

        <button
          className="btn btn-primary m-1"
          onClick={(e) => depositToken(e, wNEAR, 1, OneNear)}
        >
          Deposit 1 wNEAR
        </button>
        {(!allowance || allowance.lt(Big(10))) && (
          <button
            className="btn btn-info m-1"
            onClick={(e) => approve(e, wNEAR, 10)}
          >
            Approve wNEAR on Trisolaris
          </button>
        )}

        {(!allowanceUSDC || allowanceUSDC.lt(Big(10))) && (
          <button
            className="btn btn-info m-1"
            onClick={(e) => approve(e, USDC, 10)}
          >
            Approve USDC on Trisolaris
          </button>
        )}
        <button
          className="btn btn-warning m-1"
          onClick={(e) => swap(e, wNEAR, USDC, 1, 0)}
        >
          Swap 1 wNEAR to USDC on Trisolaris test pair
        </button>
        <button
          className="btn btn-success m-1"
          onClick={(e) => withdrawToken(e, USDC, 1)}
        >
          Withdraw 1 USDC
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
