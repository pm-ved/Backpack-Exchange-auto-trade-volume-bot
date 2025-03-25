# Auto Trade on Backpack Exchange via API

Automate trading on the Backpack Exchange using API and JavaScript.

## Prerequisites

- Ensure you have at least **10 $USDC** in your exchange account.
- Supported trading pair: **$SOL/$USDC**.
- Generate an API key via: **Portfolio > Settings > API Keys > New API Key**.

## Setup Guide

1. **Create an Account**: [Backpack Exchange](https://backpack.exchange/refer/15pgbk1r)
2. **Download the Code**: [GitHub Repository]
3. **Generate API Key**: [Backpack Exchange API Keys](https://backpack.exchange/settings/api-keys)
4. **Install Node.js**: [Installation Guide](https://www.geeksforgeeks.org/installation-of-node-js-on-windows) (Version >= v18.16.0)
5. **Configure API Keys**:
   - Add API_KEYS and API_SECRET to .env file

## Run the Script

```sh
npm install
```

```sh
node ./main.js
```

## RUN MULTIPLE ACCOUNT

### Config yours account in `main_multi.js`

```js
const workerData = {
  account: [
    {
      Backpack_API_SECRET: "YOUR_SECRET",
      Backpack_API_KEY: "YOUR_KEY",
      proxy: "PROXY_URL",
    },
  ],
};
```

### Run script

```sh
node ./main_multi.js
```


Source from https://github.com/solotop999/auto_trade_backpack_exchange and catsats