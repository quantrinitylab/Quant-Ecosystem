import { z } from 'zod';

export const MappingSchema = z.object({
  quantConvId: z.string(),
  matrixRoomId: z.string(),
  type: z.enum(['dm', 'group']),
});

export type Mapping = z.infer<typeof MappingSchema>;

/**
 * Interface for persisting room mappings between Quant conversations and Matrix rooms.
 * Implementations can use in-memory storage (for tests/dev) or a database (for production).
 */
export interface RoomMappingStore {
  set(quantConvId: string, matrixRoomId: string, type: 'dm' | 'group'): Promise<void> | void;
  getMatrixRoom(quantConvId: string): Promise<string | undefined> | string | undefined;
  getQuantConversation(matrixRoomId: string): Promise<string | undefined> | string | undefined;
  getMappingType(
    quantConvId: string,
  ): Promise<'dm' | 'group' | undefined> | 'dm' | 'group' | undefined;
  remove(quantConvId: string): Promise<void> | void;
  hasQuantConv(quantConvId: string): Promise<boolean> | boolean;
  hasMatrixRoom(matrixRoomId: string): Promise<boolean> | boolean;
}

/**
 * In-memory implementation of RoomMappingStore.
 * Suitable for tests, development, and when no persistent database is available.
 */
export class InMemoryRoomMappingStore implements RoomMappingStore {
  private quantToMatrix = new Map<string, string>();
  private matrixToQuant = new Map<string, string>();
  private mappingTypes = new Map<string, 'dm' | 'group'>();

  set(quantConvId: string, matrixRoomId: string, type: 'dm' | 'group'): void {
    this.quantToMatrix.set(quantConvId, matrixRoomId);
    this.matrixToQuant.set(matrixRoomId, quantConvId);
    this.mappingTypes.set(quantConvId, type);
  }

  getMatrixRoom(quantConvId: string): string | undefined {
    return this.quantToMatrix.get(quantConvId);
  }

  getQuantConversation(matrixRoomId: string): string | undefined {
    return this.matrixToQuant.get(matrixRoomId);
  }

  getMappingType(quantConvId: string): 'dm' | 'group' | undefined {
    return this.mappingTypes.get(quantConvId);
  }

  remove(quantConvId: string): void {
    const matrixRoomId = this.quantToMatrix.get(quantConvId);
    if (matrixRoomId) {
      this.matrixToQuant.delete(matrixRoomId);
    }
    this.quantToMatrix.delete(quantConvId);
    this.mappingTypes.delete(quantConvId);
  }

  hasQuantConv(quantConvId: string): boolean {
    return this.quantToMatrix.has(quantConvId);
  }

  hasMatrixRoom(matrixRoomId: string): boolean {
    return this.matrixToQuant.has(matrixRoomId);
  }
}

/**
 * RoomMapper manages bidirectional mappings between Quant conversations and Matrix rooms.
 * Uses a pluggable RoomMappingStore for persistence.
 */
export class RoomMapper {
  private store: RoomMappingStore;

  constructor(store?: RoomMappingStore) {
    this.store = store ?? new InMemoryRoomMappingStore();
  }

  createMapping(quantConvId: string, matrixRoomId: string, type: 'dm' | 'group'): void {
    if (this.store.hasQuantConv(quantConvId)) {
      throw new Error(`Mapping already exists for Quant conversation: ${quantConvId}`);
    }
    if (this.store.hasMatrixRoom(matrixRoomId)) {
      throw new Error(`Mapping already exists for Matrix room: ${matrixRoomId}`);
    }

    this.store.set(quantConvId, matrixRoomId, type);
  }

  getMatrixRoom(quantConvId: string): string | undefined {
    return this.store.getMatrixRoom(quantConvId) as string | undefined;
  }

  getQuantConversation(matrixRoomId: string): string | undefined {
    return this.store.getQuantConversation(matrixRoomId) as string | undefined;
  }

  removeMapping(quantConvId: string): void {
    this.store.remove(quantConvId);
  }

  getMappingType(quantConvId: string): 'dm' | 'group' | undefined {
    return this.store.getMappingType(quantConvId) as 'dm' | 'group' | undefined;
  }

  getStore(): RoomMappingStore {
    return this.store;
  }
}
