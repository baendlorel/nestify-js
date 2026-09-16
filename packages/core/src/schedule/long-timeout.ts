// 2 ** 31 - 1. Maximum delay for setTimeout in Node.js (approximately 24.8 days)
const MAX_DELAY = 2147483647;

export function longTimeout(fn: () => void, delay: number): NodeJS.Timeout {
  if (delay >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Delay exceeds the maximum safe integer value.');
  }
  if (delay > MAX_DELAY) {
    return setTimeout(() => longTimeout(fn, delay - MAX_DELAY), MAX_DELAY);
  }
  return setTimeout(fn, delay);
}
