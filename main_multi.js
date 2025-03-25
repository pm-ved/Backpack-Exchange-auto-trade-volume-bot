const workerData = {
  account: [
    {
      Backpack_API_SECRET: "YOUR_SECRET",
      Backpack_API_KEY: "YOUR_KEY",
      proxy: "PROXY_URL",
    },
  ],
};

import { Worker } from "worker_threads";

const worker = new Worker("main.js", {
  workerData,
});

worker.on("message", (message) => {
  console.log(message);
});

worker.on("error", (error) => {
  console.error(error);
});
