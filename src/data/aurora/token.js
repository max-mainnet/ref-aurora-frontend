import { useAurora } from '../near';
import { useEffect, useState } from 'react';
import Big from 'big.js';
import { buildInput, decodeOutput, toAddress } from '../utils';
import { Erc20Abi } from '../../abi/erc20';

const fetchErc20Balance = async (aurora, accountAddress, tokenAddress) => {
  try {
    const input = buildInput(Erc20Abi, 'balanceOf', [
      accountAddress.toString(),
    ]);
    const res = (
      await aurora.view(
        toAddress(accountAddress),
        toAddress(tokenAddress),
        0,
        input
      )
    ).unwrap();

    const out = decodeOutput(Erc20Abi, 'balanceOf', res);

    return Big(out[0]);
  } catch (e) {
    return false;
  }
};

export const useErc20Balances = (accountAddress, tokenAddresses) => {
  const aurora = useAurora();

  const [tokenBalances, setTokenBalances] = useState(null);

  useEffect(() => {
    if (!aurora || !accountAddress || !tokenAddresses) {
      setTokenBalances(null);
      return;
    }

    const currentAccountAddress = accountAddress;

    setTokenBalances(
      tokenAddresses.reduce((obj, tokenAddress) => {
        obj[tokenAddress] = null;
        return obj;
      }, {})
    );
    tokenAddresses.forEach((tokenAddress) => {
      fetchErc20Balance(aurora, accountAddress, tokenAddress).then(
        (balance) => {
          if (currentAccountAddress === accountAddress) {
            setTokenBalances((state) =>
              Object.assign({}, state, { [tokenAddress]: balance })
            );
          }
        }
      );
    });
  }, [aurora, accountAddress, tokenAddresses]);

  return tokenBalances;
};
