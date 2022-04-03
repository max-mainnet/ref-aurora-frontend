import React, { useEffect, useState } from 'react';
import Dashboard from '../components/Dashboard/Dashboard';
import { useAccount } from '../data/account';
import { AccountID } from '@aurora-is-near/engine';

export default function MainPage(props) {
  const [address, setAddress] = useState('');

  const account = useAccount();

  const accountId = account && account.accountId;
  useEffect(() => {
    if (accountId) {
      const address = new AccountID(accountId).toAddress().toString();
      setAddress(address);
    }
  }, [accountId]);

  const onAddressChange = (e) => {
    setAddress(e.target.value);
  };

  return (
    <div>
      <div className="container">
        <div className="row mb-3">
          <label htmlFor="eth-address">Aurora address:</label>
          <input
            name="eth-address"
            className="form-control"
            type="text"
            placeholder="0x1234..."
            value={address}
            onChange={onAddressChange}
          />
        </div>
        <div className="row mb-3">
          <Dashboard address={address} />
        </div>
      </div>
    </div>
  );
}
