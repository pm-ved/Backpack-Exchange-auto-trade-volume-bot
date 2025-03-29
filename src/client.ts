import got, { Response } from "got";
import crypto from "crypto";
import qs from "qs";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { currentDateOnlyTimestamp } from "./utils.js";

const BACKOFF_EXPONENT = 1.5;
const DEFAULT_TIMEOUT_MS = 5000;
const BASE_URL = "https://api.backpack.exchange/";
// const BASE_URL = "https://api.cf.backpack.exchange/";

interface Instruction {
  url: string;
  method: string;
}

const instructions: {
  public: Map<string, Instruction>;
  private: Map<string, Instruction>;
} = {
  public: new Map<string, Instruction>([
    ["assets", { url: `${BASE_URL}api/v1/assets`, method: "GET" }],
    ["markets", { url: `${BASE_URL}api/v1/markets`, method: "GET" }],
    ["ticker", { url: `${BASE_URL}api/v1/ticker`, method: "GET" }],
    ["depth", { url: `${BASE_URL}api/v1/depth`, method: "GET" }],
    ["klines", { url: `${BASE_URL}api/v1/klines`, method: "GET" }],
    ["status", { url: `${BASE_URL}api/v1/status`, method: "GET" }],
    ["ping", { url: `${BASE_URL}api/v1/ping`, method: "GET" }],
    ["time", { url: `${BASE_URL}api/v1/time`, method: "GET" }],
    ["trades", { url: `${BASE_URL}api/v1/trades`, method: "GET" }],
    ["tradesHistory", { url: `${BASE_URL}api/v1/trades/history`, method: "GET" }],
  ]),
  private: new Map<string, Instruction>([
    ["balanceQuery", { url: `${BASE_URL}api/v1/capital`, method: "GET" }],
    ["depositAddressQuery", { url: `${BASE_URL}wapi/v1/capital/deposit/address`, method: "GET" }],
    ["depositQueryAll", { url: `${BASE_URL}wapi/v1/capital/deposits`, method: "GET" }],
    ["fillHistoryQueryAll", { url: `${BASE_URL}wapi/v1/history/fills`, method: "GET" }],
    ["orderCancel", { url: `${BASE_URL}api/v1/order`, method: "DELETE" }],
    ["orderCancelAll", { url: `${BASE_URL}api/v1/orders`, method: "DELETE" }],
    ["orderExecute", { url: `${BASE_URL}api/v1/order`, method: "POST" }],
    ["orderHistoryQueryAll", { url: `${BASE_URL}wapi/v1/history/orders`, method: "GET" }],
    ["orderQuery", { url: `${BASE_URL}api/v1/order`, method: "GET" }],
    ["orderQueryAll", { url: `${BASE_URL}api/v1/orders`, method: "GET" }],
    ["withdraw", { url: `${BASE_URL}wapi/v1/capital/withdrawals`, method: "POST" }],
    ["withdrawalQueryAll", { url: `${BASE_URL}wapi/v1/capital/withdrawals`, method: "GET" }],
    ["positionQuery", { url: `${BASE_URL}api/v1/position`, method: "GET" }],
  ]),
};

const toPkcs8der = (rawB64: string): crypto.KeyObject => {
  const rawPrivate = Buffer.from(rawB64, "base64").subarray(0, 32);
  const prefixPrivateEd25519 = Buffer.from("302e020100300506032b657004220420", "hex");
  const der = Buffer.concat([prefixPrivateEd25519, rawPrivate]);
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
};

const toSpki = (rawB64: string): crypto.KeyObject => {
  const rawPublic = Buffer.from(rawB64, "base64");
  const prefixPublicEd25519 = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([prefixPublicEd25519, rawPublic]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
};

/**
 * Signs the request using the private key.
 *
 * @param request - Request parameters as an object.
 * @param privateKey - Base64 encoded private key.
 * @param timestamp - Unix time in ms that the request was sent.
 * @param instruction - API instruction.
 * @param window - Time window in milliseconds that the request is valid for.
 * @returns Base64 encoded signature to include on request.
 */
const getMessageSignature = (
  request: Record<string, any>,
  privateKey: string,
  timestamp: number,
  instruction: string,
  window?: number
): string => {
  function alphabeticalSort(a: string, b: string) {
    return a.localeCompare(b);
  }
  const message = qs.stringify(request, { sort: alphabeticalSort });
  const headerInfo = { timestamp, window: window ?? DEFAULT_TIMEOUT_MS };
  const headerMessage = qs.stringify(headerInfo);
  const messageToSign = "instruction=" + instruction + "&" + (message ? message + "&" : "") + headerMessage;
  const signature = crypto.sign(undefined, Buffer.from(messageToSign), toPkcs8der(privateKey));
  return signature.toString("base64");
};

const rawRequest = async (
  instruction: string,
  headers: Record<string, string>,
  data: Record<string, any>,
  opts: Record<string, any> = {}
): Promise<any> => {
  let methodConfig: Instruction | undefined;
  if (instructions.private.has(instruction)) {
    methodConfig = instructions.private.get(instruction);
  } else {
    methodConfig = instructions.public.get(instruction);
  }
  if (!methodConfig) {
    throw new Error(`Instruction ${instruction} not found`);
  }
  let { url, method } = methodConfig;
  let fullUrl = url;
  headers["User-Agent"] = "Backpack Typescript API Client";
  headers["Content-Type"] = method === "GET" ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8";

  const options: Record<string, any> = { ...opts, headers };

  if (method === "GET") {
    options.method = method;
    if (Object.keys(data).length > 0) {
      fullUrl = url + "?" + qs.stringify(data);
    }
  } else if (method === "POST" || method === "DELETE") {
    options.method = method;
    options.body = JSON.stringify(data);
  }

  const response: Response<string> = await got.default(fullUrl, options);
  const contentType = response.headers["content-type"];
  if (contentType?.includes("application/json")) {
    const parsed = JSON.parse(response.body, function (_key, value) {
      if (Array.isArray(value) && value.length === 0) {
        return value;
      }
      if (isNaN(Number(value))) {
        return value;
      }
      return Number(value);
    });
    if (parsed.error && parsed.error.length) {
      const error = parsed.error.filter((e: string) => e.startsWith("E")).map((e: string) => e.substr(1));
      if (!error.length) {
        throw new Error("Backpack API returned an unknown error");
      }
      throw new Error(`url=${url} body=${options["body"]} err=${error.join(", ")}`);
    }
    return parsed;
  } else if (contentType?.includes("text/plain")) {
    return response.body;
  } else {
    return response;
  }
};

interface BackpackClientConfig {
  privateKey: string;
  publicKey: string;
  timeout?: number;
}

export class BackpackClient {
  private config: BackpackClientConfig;
  private agent?: any;

  constructor(privateKey: string, publicKey: string, proxy?: string) {
    this.config = { privateKey, publicKey };

    if (proxy) {
      // Dynamically require the https-proxy-agent package
      if (!proxy.startsWith("http://") && !proxy.startsWith("https://")) {
        proxy = "http://" + proxy;
      }
      this.agent = new HttpsProxyAgent(proxy);
    }

    // Verify that the keys are a correct pair before sending any requests.
    const pubkeyFromPrivateKey = crypto
      .createPublicKey(toPkcs8der(privateKey))
      .export({ format: "der", type: "spki" })
      .toString("base64");

    const pubkey = toSpki(publicKey).export({ format: "der", type: "spki" }).toString("base64");

    if (pubkeyFromPrivateKey !== pubkey) {
      throw new Error("错误的秘钥对，请检查私钥公钥是否匹配");
    }
  }

  /**
   * Makes a public or private API request.
   *
   * @param method - API method name.
   * @param params - Arguments to pass to the API call.
   * @param retrysLeft - Number of retry attempts remaining.
   * @returns The response object.
   */
  async api(method: string, params: Record<string, any>, retrysLeft: number = 10): Promise<any> {
    try {
      if (instructions.public.has(method)) {
        return await this.publicMethod(method, params);
      } else if (instructions.private.has(method)) {
        return await this.privateMethod(method, params);
      }
    } catch (e: any) {
      if (retrysLeft > 0) {
        const numTry = 11 - retrysLeft;
        const backOff = Math.pow(numTry, BACKOFF_EXPONENT);
        console.warn(
          "BPX api error",
          {
            method,
            numTry,
            backOff,
          },
          e.toString(),
          e.response && e.response.body ? e.response.body : ""
        );
        await new Promise((resolve) => setTimeout(resolve, backOff * 1000));
        return await this.api(method, params, retrysLeft - 1);
      } else {
        throw e;
      }
    }
    throw new Error(method + " is not a valid API method.");
  }

  /**
   * Makes a public API request.
   *
   * @param instruction - The API method.
   * @param params - Arguments to pass to the API call.
   * @returns The response object.
   */
  async publicMethod(instruction: string, params: Record<string, any> = {}): Promise<any> {
    return await rawRequest(instruction, {}, params);
  }

  /**
   * Makes a private API request.
   *
   * @param instruction - The API method.
   * @param params - Arguments to pass to the API call.
   * @returns The response object.
   */
  async privateMethod(instruction: string, params: Record<string, any> = {}): Promise<any> {
    const timestamp = Date.now();
    const window = this.config.timeout ?? DEFAULT_TIMEOUT_MS;
    const signature = getMessageSignature(params, this.config.privateKey, timestamp, instruction, window);
    const headers: Record<string, string> = {
      "X-Timestamp": timestamp.toString(),
      "X-Window": window.toString(),
      "X-API-Key": this.config.publicKey,
      "X-Signature": signature,
    };
    return await rawRequest(instruction, headers, params, {
      agent: {
        http: this.agent,
      },
    });
  }

  // API methods

  async Balance(): Promise<any> {
    return this.api("balanceQuery", {});
  }

  async Deposits(params: Record<string, any>): Promise<any> {
    return this.api("depositQueryAll", params);
  }

  async DepositAddress(params: Record<string, any>): Promise<any> {
    return this.api("depositAddressQuery", params);
  }

  async Withdrawals(params: Record<string, any>): Promise<any> {
    return this.api("withdrawalQueryAll", params);
  }

  async Withdraw(params: Record<string, any>): Promise<any> {
    return this.api("withdraw", params);
  }

  async OrderHistory(params: Record<string, any>): Promise<any> {
    return this.api("orderHistoryQueryAll", params);
  }

  async FillHistory(params: Record<string, any>): Promise<any> {
    return this.api("fillHistoryQueryAll", params);
  }

  async Assets(): Promise<any> {
    return this.api("assets", {});
  }

  async Markets(): Promise<any> {
    return this.api("markets", {});
  }

  async Ticker(params: Record<string, any>): Promise<any> {
    return this.api("ticker", params);
  }

  async Depth(params: Record<string, any>): Promise<any> {
    return this.api("depth", params);
  }

  async KLines(params: Record<string, any>): Promise<any> {
    return this.api("klines", params);
  }

  async GetOrder(params: Record<string, any>): Promise<any> {
    return this.api("orderQuery", params);
  }

  async ExecuteOrder(params: Record<string, any>): Promise<any> {
    // Using fewer retries for order execution
    return this.api("orderExecute", params, 3);
  }

  async CancelOrder(params: Record<string, any>): Promise<any> {
    return this.api("orderCancel", params);
  }

  async GetOpenOrders(params: Record<string, any>): Promise<any> {
    return this.api("orderQueryAll", params);
  }

  async CancelOpenOrders(params: Record<string, any>): Promise<any> {
    return this.api("orderCancelAll", params);
  }

  async Status(): Promise<any> {
    return this.api("status", {});
  }

  async Ping(): Promise<any> {
    return this.api("ping", {});
  }

  async Time(): Promise<any> {
    return this.api("time", {});
  }

  async RecentTrades(params: Record<string, any>): Promise<any> {
    return this.api("trades", params);
  }

  async HistoricalTrades(params: Record<string, any>): Promise<any> {
    return this.api("tradesHistory", params);
  }

  async Position(): Promise<any> {
    return this.api("positionQuery", {});
  }

  /**
   * Connects to the Backpack Websocket for order updates.
   *
   * @returns WebSocket instance connected to the order update stream.
   */
  subscribeOrderUpdate(): WebSocket {
    const privateStream = new WebSocket("wss://ws.backpack.exchange");
    const timestamp = Date.now();
    const window = 5000;
    const signature = getMessageSignature({}, this.config.privateKey, timestamp, "subscribe", window);
    const subscriptionData = {
      method: "SUBSCRIBE",
      params: ["account.orderUpdate"],
      signature: [this.config.publicKey, signature, timestamp.toString(), window.toString()],
    };
    privateStream.onopen = () => {
      console.log("Connected to BPX Websocket");
      privateStream.send(JSON.stringify(subscriptionData));
    };
    privateStream.onerror = (error) => console.log(`Websocket Error ${error}`);

    return privateStream;
  }

  async getVolume(from: number = currentDateOnlyTimestamp()): Promise<number> {
    let currentVolume = 0;
    const historys = await this.FillHistory({ from });
    for (const history of historys) {
      currentVolume += Number(history.quantity) * Number(history.price);
    }
    return currentVolume;
  }
}
