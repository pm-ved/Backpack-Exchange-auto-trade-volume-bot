import WebSocket from "ws";
export declare class BackpackClient {
    private config;
    private agent?;
    constructor(privateKey: string, publicKey: string, proxy?: string);
    /**
     * Makes a public or private API request.
     *
     * @param method - API method name.
     * @param params - Arguments to pass to the API call.
     * @param retrysLeft - Number of retry attempts remaining.
     * @returns The response object.
     */
    api(method: string, params: Record<string, any>, retrysLeft?: number): Promise<any>;
    /**
     * Makes a public API request.
     *
     * @param instruction - The API method.
     * @param params - Arguments to pass to the API call.
     * @returns The response object.
     */
    publicMethod(instruction: string, params?: Record<string, any>): Promise<any>;
    /**
     * Makes a private API request.
     *
     * @param instruction - The API method.
     * @param params - Arguments to pass to the API call.
     * @returns The response object.
     */
    privateMethod(instruction: string, params?: Record<string, any>): Promise<any>;
    Balance(): Promise<any>;
    Deposits(params: Record<string, any>): Promise<any>;
    DepositAddress(params: Record<string, any>): Promise<any>;
    Withdrawals(params: Record<string, any>): Promise<any>;
    Withdraw(params: Record<string, any>): Promise<any>;
    OrderHistory(params: Record<string, any>): Promise<any>;
    FillHistory(params: Record<string, any>): Promise<any>;
    Assets(): Promise<any>;
    Markets(): Promise<any>;
    Ticker(params: Record<string, any>): Promise<any>;
    Depth(params: Record<string, any>): Promise<any>;
    KLines(params: Record<string, any>): Promise<any>;
    GetOrder(params: Record<string, any>): Promise<any>;
    ExecuteOrder(params: Record<string, any>): Promise<any>;
    CancelOrder(params: Record<string, any>): Promise<any>;
    GetOpenOrders(params: Record<string, any>): Promise<any>;
    CancelOpenOrders(params: Record<string, any>): Promise<any>;
    Status(): Promise<any>;
    Ping(): Promise<any>;
    Time(): Promise<any>;
    RecentTrades(params: Record<string, any>): Promise<any>;
    HistoricalTrades(params: Record<string, any>): Promise<any>;
    Position(): Promise<any>;
    /**
     * Connects to the Backpack Websocket for order updates.
     *
     * @returns WebSocket instance connected to the order update stream.
     */
    subscribeOrderUpdate(): WebSocket;
    getVolume(from?: number): Promise<number>;
}
