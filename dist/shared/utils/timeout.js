export class TimeoutError extends Error {
    name = 'TimeoutError';
}
export function withTimeout(p, ms) {
    let timer;
    return Promise.race([
        p,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}
//# sourceMappingURL=timeout.js.map