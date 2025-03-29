export { delay, getNowFormatDate, currentDateOnlyTimestamp, log, sleepToNextDate };
declare const delay: (ms: number) => Promise<unknown>;
declare const getNowFormatDate: () => string;
declare const currentDateOnlyTimestamp: () => number;
declare const log: (...args: any[]) => void;
declare const sleepToNextDate: (f?: number, t?: number) => Promise<void>;
