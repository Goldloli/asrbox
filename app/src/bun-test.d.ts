declare module 'bun:test' {
  export const describe: (name: string, run: () => void) => void;
  export const expect: (value: unknown) => any;
  export const test: any;
  export const it: any;
  export const afterEach: (fn: () => void | Promise<void>) => void;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
}
