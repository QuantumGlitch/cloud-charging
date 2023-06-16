"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { wait } = require("./utils");
const redis = require("redis");
const util = require("util");

//#region Client handlers
let client;

export async function setupRedisClient() {
  return new Promise((resolve, reject) => {
    try {
      const _client = new redis.RedisClient({
        host: process.env.ENDPOINT,
        port: parseInt(process.env.PORT || "6379"),
      });
      _client.on("ready", () => {
        console.log("redis client ready");
        client = _client;
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function disconnectRedisClient() {
  return new Promise((resolve, reject) => {
    client.quit((error, res) => {
      if (error) {
        reject(error);
      } else if (res == "OK") {
        console.log("redis client disconnected");
        resolve(res);
      } else {
        reject("unknown error closing redis connection.");
      }
    });
  });
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

export async function getAccountBalance(accountId) {
  const res = await util
    .promisify(client.get)
    .bind(client)
    .call(client, getAccountBalanceKey(accountId));

  return res ? parseFloat(res) : 0;
}

export async function setAccountBalance(accountId, balance) {
  const res = await util
    .promisify(client.set)
    .bind(client)
    .call(client, getAccountBalanceKey(accountId), String(balance));

  return res ? parseFloat(res) : 0;
}
//#endregion

//#region Lock functionalities
export function getAccountBalanceLockKey(accountId) {
  return `${accountId}/balance/locked`;
}

export async function isAccountBalanceLocked(accountId) {
  const res = await util
    .promisify(client.get)
    .bind(client)
    .call(client, getAccountBalanceLockKey(accountId));

  return res ? res === "1" : "0";
}

export async function setAccountBalanceLock(accountId, value) {
  const res = await util
    .promisify(client.set)
    .bind(client)
    .call(client, getAccountBalanceLockKey(accountId), value ? "1" : "0");

  return res ? parseFloat(res) : 0;
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
