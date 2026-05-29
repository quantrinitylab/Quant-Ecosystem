import { z } from 'zod';

export const MappingSchema = z.object({
  quantConvId: z.string(),
  matrixRoomId: z.string(),
  type: z.enum(['dm', 'group']),
});

export type Mapping = z.infer<typeof MappingSchema>;

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory Map-based room mapping, no persistent storage
 * Production path: Persist mappings in database, sync with Matrix homeserver
 */
export class RoomMapper {
  private quantToMatrix: Map<string, string> = new Map();
  private matrixToQuant: Map<string, string> = new Map();
  private mappingTypes: Map<string, 'dm' | 'group'> = new Map();

  createMapping(quantConvId: string, matrixRoomId: string, type: 'dm' | 'group'): void {
    if (this.quantToMatrix.has(quantConvId)) {
      throw new Error(`Mapping already exists for Quant conversation: ${quantConvId}`);
    }
    if (this.matrixToQuant.has(matrixRoomId)) {
      throw new Error(`Mapping already exists for Matrix room: ${matrixRoomId}`);
    }

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

  removeMapping(quantConvId: string): void {
    const matrixRoomId = this.quantToMatrix.get(quantConvId);
    if (matrixRoomId) {
      this.matrixToQuant.delete(matrixRoomId);
    }
    this.quantToMatrix.delete(quantConvId);
    this.mappingTypes.delete(quantConvId);
  }

  getMappingType(quantConvId: string): 'dm' | 'group' | undefined {
    return this.mappingTypes.get(quantConvId);
  }
}
