import fs from "fs";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";

/** @type {import('./src/types.js').Account[]} */ const accounts = [];

// Parse data.csv to populate accounts
fs.createReadStream("data.csv")
  .pipe(csvParser())
  .on("data", (row) => {
    accounts.push({
      Backpack_API_SECRET: row.API_SECRET,
      Backpack_API_KEY: row.API_KEY,
      proxy: row.PROXY_URL,
      // tradeAmount: 80,
      // maxVolumeDaily: 50000,
      // tradePair: "SOL_USDC_PERP",
    });
  })
  .on("end", () => {
    console.log("CSV file successfully processed");
    console.log("Starting worker...");
    console.log(`1 worker started for ${accounts.length} accounts`);

    const worker = new Worker("./main.js", {
      workerData: { account: accounts },
    });

    worker.on("message", (message) => {
      console.log(message);
    });

    worker.on("error", (error) => {
      console.error(error);
    });
  });
