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
  parseAuroraPool,
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
import { AccountID } from '@aurora-is-near/engine';

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

  const getTotalSupply = useCallback(async () => {
    const input = buildInput(UniswapPairAbi, 'totalSupply', []);

    const res = (
      await aurora.view(toAddress(address), toAddress(pairAdd), 0, input)
    ).unwrap();
    return decodeOutput(UniswapPairAbi, 'totalSupply', res);
  }, [address, aurora]);

  const getReserves = useCallback(
    async (aurora, address, nep141A, nep141B) => {
      const input = buildInput(UniswapPairAbi, 'getReserves', []);

      const Erc20A = await getErc20Addr(nep141A);
      const Erc20B = await getErc20Addr(nep141B);

      console.log(Erc20A.id, Erc20B.id, Erc20A.id < Erc20B.id);

      const res = (
        await aurora.view(toAddress(address), toAddress(pairAdd), 0, input)
      ).unwrap();

      const shares = await getTotalSupply();

      const decodedRes = decodeOutput(UniswapPairAbi, 'getReserves', res);

      // TODO: share decimal === 18
      return parseAuroraPool(
        decodedRes,
        nep141A,
        nep141B,
        Erc20A,
        Erc20B,
        shares[0]
      );
    },
    [getErc20Addr, getTotalSupply]
  );

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

    getReserves(aurora, address, wNEAR, USDC).then((res) => console.log(res));
  }, [address, aurora, getErc20Addr, getReserves, near]);

  const sortedErc20Balances = erc20Balances
    ? Object.entries(erc20Balances).filter(([t, b]) => b && Big(b).gt(0))
    : [];

  sortedErc20Balances.sort(([t1, a], [t2, b]) => b.cmp(a));

  const depositToken = async (e, token, amount, unit) => {
    // e.preventDefault();
    // setLoading(true);

    // const actions = [
    //   [
    //     token,
    //     nearAPI.transactions.functionCall(
    //       'ft_transfer_call',
    //       {
    //         receiver_id: NearConfig.contractName,
    //         amount: Big(amount).mul(unit).toFixed(0),
    //         memo: '',
    //         msg: address.substring(2),
    //       },
    //       TGas.mul(70).toFixed(0),
    //       1
    //     ),
    //   ],
    // ];

    return [
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
    ];

    // await near.sendTransactions(actions);
  };

  const withdrawToken = async (e, token, amount, unit) => {
    e.preventDefault();
    // setLoading(true);
    const input = buildInput(Erc20Abi, 'withdrawToNear', [
      `0x${Buffer.from(account.accountId, 'utf-8').toString('hex')}`,
      unit.mul(amount).round(0, 0).toFixed(0), // need to check decimals in real case
    ]);
    const erc20Addr = await getErc20Addr(token);
    if (erc20Addr) {
      // const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();

      return auroraCallAction(toAddress(erc20Addr), input);

      // console.log(res);
      // return ['aurora', auroraCallAction(toAddress(erc20Addr), input)];
    }
  };

  const approve = async (e, token, amount, unit) => {
    e.preventDefault();

    const input = buildInput(Erc20Abi, 'increaseAllowance', [
      trisolaris,
      unit.mul(amount).round(0, 0).toFixed(0),
    ]);

    // setLoading(true);

    const erc20Addr = await getErc20Addr(token);

    if (erc20Addr) {
      return auroraCallAction(toAddress(erc20Addr), input);

      // const res = (await aurora.call(toAddress(erc20Addr), input)).unwrap();
      // setLoading(false);

      // console.log(res);
    }
  };

  const swap = async (e, from, to, amount_in, amount_out) => {
    e.preventDefault();
    // setLoading(true);

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
      // const res = (await aurora.call(toAddress(trisolaris), input)).unwrap();

      return auroraCallAction(toAddress(trisolaris), input);

      // console.log(res);

      // setLoading(false);
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

  const oneClickToAll = async (e, tokenA, tokenB, amountA) => {
    // check allowance compare allowance to account
    e.preventDefault();
    const actionList = [];
    console.log('1212');

    const depositAction = await depositToken(e, wNEAR, amountA, OneNear);
    console.log(depositAction);
    actionList.push(depositAction);

    if (Big(allowance).lt(Big(amountA))) {
      const approveAction = await approve(
        e,
        tokenA,
        Number(amountA) - Number(allowance?.div(Big(OneNear)).toFixed(0)),
        OneNear
      );
      actionList.push(approveAction);
    }

    // swap
    //TODO: slippage tolerance
    const swapAction = await swap(e, tokenA, tokenB, amountA, 0);

    actionList.push(swapAction);

    // query all balances on and withdraw all

    // const withdrawAction =  await withdrawToken(e, wNEAR, 1, OneNear);

    const withdrawAction = await withdrawToken(e, USDC, 1, OneUSDC);

    actionList.push(withdrawAction);

    near.sendTransactions(actionList);
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
          onClick={(e) => addLiquidity(e, wNEAR, USDC, 1, 10)}
        >
          add liquidity for 1 wnear and 10 USDC
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
