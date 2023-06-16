"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memcached = require("memcached");
const { wait } = require("./utils");

const MAX_EXPIRATION = 60 * 60 * 24 * 30;

//#region Client handlers
const client = new memcached(`${process.env.ENDPOINT}:${process.env.PORT}`);

export async function disconnectMemcached() {
  await client.end();
}
//#endregion

export function getChargeByServiceType(serviceType) {
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
export function getAccountBalanceKey(accountId) {
  return `${accountId}/balance`;
}

export function getAccountBalance(accountId) {
  return new Promise((resolve, reject) => {
    client.get(getAccountBalanceKey(accountId), (error, res) => {
      if (error) {
        reject(error);
      } else {
        resolve(parseFloat(res));
      }
    });
  });
}

export async function setAccountBalance(accountId, balance) {
  return new Promise((resolve, reject) => {
    client.set(
      getAccountBalanceKey(accountId),
      balance,
      MAX_EXPIRATION,
      (error, res) => {
        if (error) {
          reject(error);
        } else {
          resolve(parseFloat(res));
        }
      }
    );
  });
}
//#endregion

//#region Lock functionalities
export function getAccountBalanceLockKey(accountId) {
  return `${accountId}/balance/locked`;
}

export function isAccountBalanceLocked(accountId) {
  return new Promise((resolve, reject) => {
    client.get(getAccountBalanceLockKey(accountId), (error, res) => {
      if (error) {
        reject(error);
      } else {
        resolve(res === "1");
      }
    });
  });
}

export function setAccountBalanceLock(accountId, value) {
  return new Promise((resolve, reject) => {
    client.set(
      getAccountBalanceLockKey(accountId),
      value ? "1" : "0",
      MAX_EXPIRATION,
      (error, res) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

// When we call this function, it waits until the balance is free to be modified
export async function waitAccountBalanceToBeUnlocked(accountId) {
  const MAX_RETRIES = 10;
  let tries = 0;
  while (await isAccountBalanceLocked()) {
    // Wait 20ms and check if the account balance is still locked
    wait(20);
    tries++;

    if (tries > MAX_RETRIES) {
      throw new Error("MAX_RETRIES reached for lock waiting");
    }
  }
}

// When we call this function, we want that any operation on the account balance, will be locked until the current one is finished
export async function lockAccountBalance(accountId, lockReleaser) {
  // Wait until the lock is released
  await waitAccountBalanceToBeUnlocked(accountId);
  // Setup the lock, so only the 'lockReleaser' can do operations on it
  setAccountBalanceLock(accountId, true);
  // Call the operation
  const res = await lockReleaser();
  // Free the lock
  await setAccountBalanceLock(accountId, false);

  return res;
}
//#endregion
