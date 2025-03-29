export interface Account {
    Backpack_API_KEY: string;
    Backpack_API_SECRET: string;
    proxy?: string | string[];
    maxVolumeDaily?: number;
    tradePair?: string;
    tradeAmount?: number;
  }