"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memcached = require("memcached");
const { wait } = require("./utils");

const MAX_EXPIRATION = 60 * 60 * 24 * 30;

//#region Client handlers
const client = new memcached(`${process.env.ENDPOINT}:${process.env.PORT}`);

async function disconnectMemcached() {
  await client.end();
}
//#endregion

function getChargeByServiceType(serviceType) {
  switch (serviceType) {
    case "voice":
      return 5;
    case "message":
      return 1;
    case "data":
      return 2;
  }
}

//#region Utilities to better handle account's data
function getAccountBalanceKey(accountId) {
  return `${accountId}/balance`;
}

function getAccountBalance(accountId) {
  return new Promise((resolve, reject) => {
    client.get(getAccountBalanceKey(accountId), (error, res) => {
      if (error) {
        reject(error);
      } else {
        resolve(res ? parseFloat(res) : 0);
      }
    });
  });
}

async function setAccountBalance(accountId, balance) {
  return new Promise((resolve, reject) => {
    client.set(
      getAccountBalanceKey(accountId),
      balance,
      MAX_EXPIRATION,
      (error, res) => {
        if (error) {
          reject(error);
        } else if (!res) {
          reject();
        } else {
          resolve();
        }
      }
    );
  });
}
//#endregion

//#region Lock functionalities
function getAccountBalanceLockKey(accountId) {
  return `${accountId}/balance/locked`;
}

function isAccountBalanceLocked(accountId) {
  return new Promise((resolve, reject) => {
    const key = getAccountBalanceLockKey(accountId);
    client.gets(key, (error, res) => {
      if (error) {
        reject(error);
      } else {
        console.log(res);
        resolve(
          res
            ? { isLocked: res[key] === "1", casToken: res.cas }
            : { isLocked: false, res }
        );
      }
    });
  });
}

function setAccountBalanceLock(accountId, value, token) {
  return new Promise((resolve, reject) => {
    if (token) {
      client.cas(
        getAccountBalanceLockKey(accountId),
        value ? "1" : "0",
        token,
        MAX_EXPIRATION,
        (error, res) => {
          if (error) {
            console.error(error);
            reject(error);
          } else if (!res) {
            console.error("unknown error");
            reject("LOCKED");
          } else {
            console.log(res);
            resolve();
          }
        }
      );
    } else {
      client.set(
        getAccountBalanceLockKey(accountId),
        value ? "1" : "0",
        MAX_EXPIRATION,
        (error, res) => {
          if (error) {
            console.error(error);
            reject(error);
          } else if (!res) {
            console.error("unknown error");
            reject("LOCKED");
          } else {
            console.log(res);
            resolve();
          }
        }
      );
    }
  });
}

// When we call this function, it waits until the balance is free to be modified
async function waitAccountBalanceToBeUnlocked(accountId) {
  const MAX_RETRIES = 100;
  let tries = 0;
  let accountBalanceLock;
  do {
    accountBalanceLock = await isAccountBalanceLocked(accountId);
    console.log(accountBalanceLock);

    if (!accountBalanceLock.isLocked) {
      return { token: accountBalanceLock.casToken };
    }

    // Wait 100ms and check if the account balance is still locked
    wait(100);
    tries++;

    if (tries > MAX_RETRIES) {
      throw "MAX_RETRIES";
    }
  } while (accountBalanceLock.isLocked);

  return { token: accountBalanceLock.casToken };
}

// When we call this function, we want that any operation on the account balance, will be locked until the current one is finished
async function lockAccountBalance(accountId, lockReleaser) {
  console.log(accountId);
  const MAX_RETRIES = 100;
  let tries = 0;
  let token;

  // Wait until the lock is released
  while (!token) {
    tries++;

    if (tries > MAX_RETRIES) {
      throw "MAX_RETRIES";
    }

    ({ token } = await waitAccountBalanceToBeUnlocked(accountId));

    try {
      // Setup the lock, so only the 'lockReleaser' can do operations on it
      await setAccountBalanceLock(accountId, true, token);
    } catch (e) {
      if (e === "LOCKED") {
        // Someone took the lock before this process, retry after
        token = null;
      } else throw e;
    }
  }

  // Call the operation
  const res = await lockReleaser();

  try {
    // Free the lock
    await setAccountBalanceLock(accountId, false);
  } catch (e) {
    throw "cannot_free_lock";
  }

  return res;
}
//#endregion

exports.disconnectMemcached = disconnectMemcached;
exports.getChargeByServiceType = getChargeByServiceType;
exports.getAccountBalance = getAccountBalance;
exports.lockAccountBalance = lockAccountBalance;
exports.setAccountBalance = setAccountBalance;
