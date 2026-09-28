export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
