import type { ContextSource } from '../types.js';

export type SearchFunction = (query: string) => Promise<ContextSource[]>;

export class ContextRetriever {
  private searchFn: SearchFunction;

  constructor(searchFn?: SearchFunction) {
    this.searchFn = searchFn ?? ContextRetriever.defaultSearch;
  }

  async retrieve(query: string): Promise<ContextSource[]> {
    return this.searchFn(query);
  }

  private static async defaultSearch(_query: string): Promise<ContextSource[]> {
    return [];
  }
}
