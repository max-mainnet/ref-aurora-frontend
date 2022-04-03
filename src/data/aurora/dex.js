import { useAurora } from '../near';
import { useEffect, useState } from 'react';
import Big from 'big.js';
import { buildInput, decodeOutput, toAddress } from '../utils';
import { Erc20Abi } from '../../abi/erc20';

const fetchAllowance = async (
  aurora,
  accountAddress,
  tokenAddress,
  dexAddress
) => {
  try {
    const input = buildInput(Erc20Abi, 'allowance', [
      accountAddress.toString(),
      dexAddress.toString(),
    ]);
    const res = (
      await aurora.view(
        toAddress(accountAddress),
        toAddress(tokenAddress),
        0,
        input
      )
    ).unwrap();
    const out = decodeOutput(Erc20Abi, 'allowance', res);
    return Big(out[0]);
  } catch (e) {
    console.log(e);
    return false;
  }
};

export const useErc20AllowanceForDex = (
  accountAddress,
  tokenAddress,
  dexAddress
) => {
  const aurora = useAurora();

  const [allowance, setAllowance] = useState(null);

  useEffect(() => {
    if (!aurora || !accountAddress || !tokenAddress || !dexAddress) {
      setAllowance(null);
      return;
    }

    fetchAllowance(aurora, accountAddress, tokenAddress, dexAddress).then(
      setAllowance
    );
  }, [aurora, accountAddress, tokenAddress, dexAddress]);

  return allowance;
};
