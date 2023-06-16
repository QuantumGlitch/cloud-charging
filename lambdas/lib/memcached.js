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
  return Buffer.from(`${accountId}/balance`).toString("base64");
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
  return Buffer.from(`${accountId}/balance/locked`).toString("base64");
}

function isAccountBalanceLocked(accountId) {
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

function setAccountBalanceLock(accountId, value) {
  return new Promise((resolve, reject) => {
    client.set(
      getAccountBalanceLockKey(accountId),
      value ? "1" : "0",
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

// When we call this function, it waits until the balance is free to be modified
async function waitAccountBalanceToBeUnlocked(accountId) {
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
async function lockAccountBalance(accountId, lockReleaser) {
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

exports.disconnectMemcached = disconnectMemcached;
exports.getChargeByServiceType = getChargeByServiceType;
exports.getAccountBalance = getAccountBalance;
exports.lockAccountBalance = lockAccountBalance;
exports.setAccountBalance = setAccountBalance;
