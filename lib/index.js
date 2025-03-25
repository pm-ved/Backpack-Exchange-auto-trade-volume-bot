"use strict";
import { BackpackClient } from "./client.js";
import dotenv from "dotenv";
dotenv.config();
import { isMainThread, workerData, parentPort } from "worker_threads";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getNowFormatDate = () => new Date().toISOString().replace("T", " ").split(".")[0];
let successBuy = 0;
let sellBuy = 0;
const init = async (client) => {
    while (true) {
        try {
            console.log("\n============================");
            console.log(`Total Buy: ${successBuy} | Total Sell: ${sellBuy}`);
            console.log("============================\n");
            console.log(getNowFormatDate(), "Waiting 10 seconds...");
            await delay(10000);
            let userBalance = await client.Balance();
            if (userBalance.USDC.available > 5) {
                await buyFun(client);
            }
            else {
                await sellFun(client);
            }
            return; // Exit if balance is low
        }
        catch (e) {
            console.log(getNowFormatDate(), `Try again... (${e.message})`);
            console.log("=======================");
            await delay(3000);
        }
    }
};
const sellFun = async (client) => {
    let openOrders = await client.GetOpenOrders({ symbol: "SOL_USDC" });
    if (openOrders.length > 0) {
        await client.CancelOpenOrders({ symbol: "SOL_USDC" });
        console.log(getNowFormatDate(), "All pending orders canceled");
    }
    let userBalance = await client.Balance();
    console.log(getNowFormatDate(), `Account Info: ${userBalance.SOL.available} SOL | ${userBalance.USDC.available} USDC`);
    let { lastPrice } = await client.Ticker({ symbol: "SOL_USDC" });
    console.log(getNowFormatDate(), "SOL/USDC Price:", lastPrice);
    let quantity = (userBalance.SOL.available - 0.02).toFixed(2);
    console.log(getNowFormatDate(), `Selling ${quantity} SOL for ${(Number(lastPrice) * Number(quantity)).toFixed(2)} USDC`);
    let orderResult = await client.ExecuteOrder({
        orderType: "Limit",
        price: lastPrice.toString(),
        quantity: quantity.toString(),
        side: "Ask",
        symbol: "SOL_USDC",
        timeInForce: "IOC",
    });
    if (orderResult?.status === "Filled" && orderResult?.side === "Ask") {
        sellBuy += 1;
        console.log(getNowFormatDate(), "Sold successfully:", `Order ID: ${orderResult.id}`);
        init(client);
    }
    else {
        throw new Error(orderResult?.status || "Unknown error");
    }
};
const buyFun = async (client) => {
    let openOrders = await client.GetOpenOrders({ symbol: "SOL_USDC" });
    if (openOrders.length > 0) {
        await client.CancelOpenOrders({ symbol: "SOL_USDC" });
        console.log(getNowFormatDate(), "All pending orders canceled");
    }
    let userBalance = await client.Balance();
    console.log(getNowFormatDate(), `Account Info: ${userBalance.SOL?.available ?? 0} SOL | ${userBalance.USDC.available} USDC`);
    let { lastPrice } = await client.Ticker({ symbol: "SOL_USDC" });
    console.log(getNowFormatDate(), "SOL/USDC Price:", lastPrice);
    let quantity = ((userBalance.USDC.available - 2) / lastPrice).toFixed(2);
    console.log(getNowFormatDate(), `Buying ${quantity} SOL for ${(userBalance.USDC.available - 2).toFixed(2)} USDC`);
    let orderResult = await client.ExecuteOrder({
        orderType: "Limit",
        price: lastPrice.toString(),
        quantity: quantity.toString(),
        side: "Bid",
        symbol: "SOL_USDC",
        timeInForce: "IOC",
    });
    if (orderResult?.status === "Filled" && orderResult?.side === "Bid") {
        successBuy += 1;
        console.log(getNowFormatDate(), "Bought successfully:", `Order ID: ${orderResult.id}`);
        init(client);
    }
    else {
        throw new Error(orderResult?.status || "Unknown error");
    }
};
async function main(account) {
    let client;
    if (account) {
        if (Array.isArray(account.proxy))
            account.proxy = account.proxy[0];
        client = new BackpackClient(account.Backpack_API_SECRET, account.Backpack_API_KEY, account.proxy);
    }
    else {
        const API_KEY = process.env.API_KEY;
        const API_SECRET = process.env.API_SECRET;
        if (!API_KEY || !API_SECRET) {
            console.error("Missing API credentials. Set API_KEY and API_SECRET.");
            process.exit(1);
        }
        client = new BackpackClient(API_SECRET, API_KEY, process.env.PROXY_URL);
    }
    await init(client);
}
if (isMainThread) {
    main();
}
else if (parentPort) {
    if (!workerData.account || workerData.account.length === 0) {
        console.error('No accounts found. Please provide "account" in workerData.');
        process.exit(1);
    }
    parentPort.on("message", async (msg) => {
        if (msg.task === "close-all")
            process.exit();
    });
    console.log = (...args) => parentPort?.postMessage({ type: "log", message: JSON.stringify(args) });
    console.error = (...args) => parentPort?.postMessage({ type: "error", message: JSON.stringify(args) });
    console.warn = (...args) => parentPort?.postMessage({ type: "warn", message: JSON.stringify(args) });
    console.debug = (...args) => parentPort?.postMessage({ type: "debug", message: JSON.stringify(args) });
    for (const account of workerData.account) {
        main(account)
            .then(() => {
            console.log("Done");
        })
            .catch((e) => console.error(e));
    }
}
