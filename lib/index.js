"use strict";
import { BackpackClient } from "./client.js";
import { isMainThread, workerData, parentPort } from "worker_threads";
import dotenv from "dotenv";
import { log, delay, sleepToNextDate } from "./utils.js";
dotenv.config();
class TradeClient {
    constructor(account) {
        this.maxVolumeDaily = 2000;
        this.tradePair = "SOL_USDC_PERP";
        this.tradeAmount = 80;
        this.init = async () => {
            const { maxVolumeDaily: maxVolume, tradePair: TRADE_PAIR, client } = this;
            if (TRADE_PAIR.includes("PERP"))
                return await this.initPerp();
            const sellFun = async (client) => {
                await this.cancelOders(TRADE_PAIR);
                let userBalance = await client.Balance();
                log(`Account Info: ${userBalance.SOL.available} SOL | ${userBalance.USDC.available} USDC`);
                let { lastPrice } = await client.Ticker({ symbol: TRADE_PAIR });
                log("SOL/USDC Price:", lastPrice);
                log(userBalance);
                let quantity = (userBalance.SOL.available - 0.02).toFixed(2);
                log(`Selling ${quantity} SOL for ${(Number(lastPrice) * Number(quantity)).toFixed(2)} USDC`);
                let orderResult = await client.ExecuteOrder({
                    orderType: "Limit",
                    price: lastPrice.toString(),
                    quantity: quantity.toString(),
                    side: "Ask",
                    symbol: TRADE_PAIR,
                    timeInForce: "IOC",
                });
                if (orderResult?.status === "Filled" && orderResult?.side === "Ask") {
                    this.sellBuy += 1;
                    log("Sold successfully:", `Order ID: ${orderResult.id}`);
                    this.init();
                }
                else {
                    throw new Error(orderResult?.status || "Unknown error");
                }
            };
            const buyFun = async (client) => {
                await this.cancelOders(TRADE_PAIR);
                const userBalance = await client.Balance();
                log(`Account Info: ${userBalance.SOL?.available ?? 0} SOL | ${userBalance.USDC.available} USDC`);
                const { lastPrice } = await client.Ticker({ symbol: TRADE_PAIR });
                log("SOL/USDC Price:", lastPrice);
                let tradeAmt = this.tradeAmount;
                if (userBalance.USDC.available - 2 < this.tradeAmount) {
                    tradeAmt = userBalance.USDC.available - 2;
                }
                if (tradeAmt < 5) {
                    tradeAmt = 5.1;
                }
                const quantity = (tradeAmt / lastPrice).toFixed(2);
                log(`Buying ${quantity} SOL for ${(userBalance.USDC.available - 2).toFixed(2)} USDC`);
                const orderResult = await client.ExecuteOrder({
                    orderType: "Limit",
                    price: lastPrice.toString(),
                    quantity: quantity.toString(),
                    side: "Bid",
                    symbol: TRADE_PAIR,
                    timeInForce: "IOC",
                });
                if (orderResult?.status === "Filled" && orderResult?.side === "Bid") {
                    this.successBuy += 1;
                    log("Bought successfully:", `Order ID: ${orderResult.id}`);
                    this.init();
                }
                else {
                    throw new Error(orderResult?.status || "Unknown error");
                }
            };
            while (true) {
                try {
                    if ((await client.getVolume()) > maxVolume) {
                        log("Volume reached. Close position. wait for next day");
                        await sleepToNextDate(0, 0);
                        continue;
                    }
                    log(`Total Buy: ${this.successBuy} | Total Sell: ${this.sellBuy}`);
                    await delay(10000);
                    let userBalance = await client.Balance();
                    if (userBalance.USDC.available > 5)
                        await buyFun(client);
                    else
                        await sellFun(client);
                }
                catch (e) {
                    log(`Try again... (${e.message})`);
                    await delay(3000);
                }
            }
        };
        this.initPerp = async () => {
            const { maxVolumeDaily: maxVolume, tradePair: TRADE_PAIR, client } = this;
            const closePosition = async (client) => {
                await this.cancelOders(TRADE_PAIR);
                const positions = await client.Position();
                for (const position of positions) {
                    let orderResult = await client.ExecuteOrder({
                        orderType: "Market",
                        quantity: position.netQuantity.toString(),
                        reduceOnly: true,
                        side: "Ask",
                        symbol: TRADE_PAIR,
                    });
                    if (orderResult?.status === "Filled" && orderResult?.side === "Ask") {
                        this.sellBuy += 1;
                        log("Sold successfully:", `Order ID: ${orderResult.id}`);
                    }
                    else {
                        throw new Error(orderResult?.status || "Unknown error");
                    }
                }
            };
            const buyFun = async (client) => {
                await this.cancelOders(TRADE_PAIR);
                const userBalance = await client.Balance();
                log(`Account Info: ${userBalance.SOL?.available ?? 0} SOL | ${userBalance.USDC.available} USDC`);
                let { lastPrice } = await client.Ticker({ symbol: TRADE_PAIR });
                log("SOL/USDC Price:", lastPrice);
                if (userBalance.USDC.available < 5) {
                    log("Insufficient balance. wait for next day");
                    await sleepToNextDate(0, 0);
                    return;
                }
                let usdcAmt = userBalance.USDC.available - 2;
                if (usdcAmt < 5)
                    usdcAmt = 5.1;
                if (usdcAmt > this.tradeAmount)
                    usdcAmt = this.tradeAmount;
                const quantity = (usdcAmt / lastPrice).toFixed(2);
                log(`Buying ${quantity} SOL for ${usdcAmt} USDC`);
                const orderResult = await client.ExecuteOrder({
                    orderType: "Limit",
                    price: lastPrice.toString(),
                    quantity: quantity.toString(),
                    side: "Bid",
                    symbol: TRADE_PAIR,
                    timeInForce: "IOC",
                });
                if (orderResult?.status === "Filled" && orderResult?.side === "Bid") {
                    this.successBuy += 1;
                    log("Bought successfully:", `Order ID: ${orderResult.id}`);
                }
                else {
                    throw new Error(orderResult?.status || "Unknown error");
                }
            };
            while (true) {
                if ((await client.getVolume()) > maxVolume) {
                    await closePosition(client);
                    log("Volume reached. Close position. wait for next day");
                    await sleepToNextDate(0, 0);
                    continue;
                }
                try {
                    await closePosition(client);
                    await buyFun(client);
                    await delay(5000);
                }
                catch (e) {
                    log(`Try again... (${e.message})`);
                    await delay(3000);
                }
            }
        };
        let proxy = undefined;
        if (typeof account.proxy === "string") {
            proxy = account.proxy;
        }
        else if (Array.isArray(account.proxy)) {
            proxy = account.proxy[Math.floor(Math.random() * account.proxy.length)];
        }
        this.client = new BackpackClient(account.Backpack_API_SECRET, account.Backpack_API_KEY, proxy);
        if (account.maxVolumeDaily)
            this.maxVolumeDaily = account.maxVolumeDaily;
        if (account.tradePair)
            this.tradePair = account.tradePair;
        this.successBuy = 0;
        this.sellBuy = 0;
        this.tradeAmount = account.tradeAmount || 10;
    }
    async cancelOders(symbol) {
        const client = this.client;
        let openOrders = await client.GetOpenOrders({ symbol });
        if (openOrders.length > 0) {
            await client.CancelOpenOrders({ symbol });
            log("All pending orders canceled");
        }
    }
}
async function main(account) {
    let client;
    if (account) {
        client = new TradeClient(account);
    }
    else {
        const API_KEY = process.env.API_KEY;
        const API_SECRET = process.env.API_SECRET;
        if (!API_KEY || !API_SECRET) {
            console.error("Missing API credentials. Set API_KEY and API_SECRET.");
            process.exit(1);
        }
        client = new TradeClient({
            Backpack_API_KEY: API_KEY,
            Backpack_API_SECRET: API_SECRET,
            proxy: process.env.PROXY,
            maxVolumeDaily: Number(process.env.MAX_VOLUME),
            tradePair: process.env.TRADE_PAIR,
        });
    }
    await client.init();
}
if (isMainThread) {
    main();
}
else if (parentPort) {
    if (!workerData.account || workerData.account.length == 0) {
        console.error('No accounts found. Please provide "account" in workerData.');
        process.exit(1);
    }
    parentPort.on("message", async (msg) => {
        if (msg.task == "close-all")
            process.exit();
    });
    console.log = (...args) => parentPort?.postMessage({ type: "log", message: JSON.stringify(args) });
    console.error = (...args) => parentPort?.postMessage({ type: "error", message: JSON.stringify(args) });
    console.warn = (...args) => parentPort?.postMessage({ type: "warn", message: JSON.stringify(args) });
    console.debug = (...args) => parentPort?.postMessage({ type: "debug", message: JSON.stringify(args) });
    for (const account of workerData.account) {
        console.log("Starting account:", account);
        main(account)
            .then(() => {
            log("Done");
        })
            .catch((e) => console.error(e));
    }
}
