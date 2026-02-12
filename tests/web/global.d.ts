declare module "vitest" {
    export function describe(description: string, fn: () => void): void;

    export function it(description: string, fn: () => void): void;

    export function expect<T>(value: T): any;
}