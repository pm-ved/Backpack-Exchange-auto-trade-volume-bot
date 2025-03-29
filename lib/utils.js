export { delay, getNowFormatDate, currentDateOnlyTimestamp, log, sleepToNextDate };
const delay = (ms) => {
    log(`Sleeping for ${ms}ms`);
    return new Promise((resolve) => setTimeout(resolve, ms));
};
const getNowFormatDate = () => new Date().toISOString().replace("T", " ").split(".")[0];
const currentDateOnlyTimestamp = () => {
    const curTime = Date.now();
    return curTime - (curTime % 1000) * 60 * 60 * 24;
};
const log = (...args) => console.log(getNowFormatDate(), ...args);
const sleepToNextDate = async (f = 0, t = 0) => {
    const curTime = currentDateOnlyTimestamp();
    const nextDate = curTime + 1000 * 60 * 60 * 24;
    const sleepTime = nextDate - curTime + Math.floor(Math.random() * 1000 * 60 * 60 * (t - f) + 1000 * 60 * 60 * f);
    log(`Sleeping to next date: ${new Date(nextDate).toISOString().split("T")[0]}`);
    await delay(sleepTime);
};
