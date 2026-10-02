declare module 'pg' {
  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<T = any>(text: string): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}