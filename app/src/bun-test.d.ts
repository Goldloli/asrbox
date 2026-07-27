declare module 'bun:test' {
  export const describe: (name: string, run: () => void) => void;
  export const expect: (value: unknown) => any;
  export const test: any;
}
