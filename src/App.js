import React, { useCallback, useEffect, useState } from 'react';
import 'error-polyfill';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle';
import './App.scss';
import { BrowserRouter as Router, Link, Route, Switch } from 'react-router-dom';
import { IsMainnet, NearConfig, useNearPromise } from './data/near';
import MainPage from './pages/MainPage';

const RefTestContract = 'exchange.ref-dev.testnet';

const RefMainnetContract = 'v2.ref-finance.near';

const loginAccount = IsMainnet ? RefMainnetContract : RefTestContract;

function App(props) {
  const [connected, setConnected] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [signedAccountId, setSignedAccountId] = useState(null);

  const _near = useNearPromise();

  const requestSignIn = useCallback(
    async (e) => {
      e && e.preventDefault();
      const appTitle = 'wiki';
      const near = await _near;
      await near.walletConnection.requestSignIn('aurora', appTitle);
      return false;
    },
    [_near]
  );

  const logOut = useCallback(async () => {
    const near = await _near;
    near.walletConnection.signOut();
    near.accountId = null;
    setSignedIn(false);
    setSignedAccountId(null);
  }, [_near]);

  const refreshAllowance = useCallback(async () => {
    alert(
      "You're out of access key allowance. Need sign in again to refresh it"
    );
    await logOut();
    await requestSignIn();
  }, [logOut, requestSignIn]);

  useEffect(() => {
    _near.then((near) => {
      setSignedIn(!!near.accountId);
      setSignedAccountId(near.accountId);
      setConnected(true);
    });
  }, [_near]);

  const passProps = {
    refreshAllowance: () => refreshAllowance(),
    signedAccountId,
    signedIn,
    connected,
  };

  const Header = !connected ? (
    <div>
      Connecting...{' '}
      <span
        className="spinner-grow spinner-grow-sm"
        role="status"
        aria-hidden="true"
      />
    </div>
  ) : signedIn ? (
    <div>
      <button className="btn btn-outline-light" onClick={() => logOut()}>
        Sign out ({signedAccountId})
      </button>
    </div>
  ) : (
    <div>
      <button
        className="btn btn-outline-light"
        onClick={(e) => requestSignIn(e)}
      >
        Sign in with NEAR Wallet
      </button>
    </div>
  );
  return (
    <div className="App">
      <Router basename={process.env.PUBLIC_URL}>
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-3">
          <div className="container-fluid">
            <a
              className="navbar-brand"
              href="/"
              title="Play with Aurora DeFi protocols using NEAR account"
            >
              Play with Aurora DeFi protocols using NEAR account
            </a>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarSupportedContent"
              aria-controls="navbarSupportedContent"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon" />
            </button>
            <div
              className="collapse navbar-collapse"
              id="navbarSupportedContent"
            >
              <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                <li className="nav-item">
                  <Link className="nav-link" aria-current="page" to="/">
                    Main
                  </Link>
                </li>
              </ul>
              <form className="d-flex">{Header}</form>
            </div>
          </div>
        </nav>

        <Switch>
          <Route exact path={'/'}>
            <MainPage {...passProps} />
          </Route>
        </Switch>
      </Router>
    </div>
  );
}

export default App;
