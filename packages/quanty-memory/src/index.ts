export type MemoryClass='explicit'|'preference'|'episodic'|'semantic'|'temporary'|'derived_signal';
export type MemorySensitivity='normal'|'sensitive'|'restricted';
export interface MemoryCandidate { candidateId:string; userId:string; class:MemoryClass; value:unknown; confidence:number; sensitivity:MemorySensitivity; sourceRef:string; sourceVersion?:number; createdAt:string; expiresAt?:string; }
export interface MemoryPolicy { allowDurable:boolean; allowedClasses:MemoryClass[]; allowedSensitivity:MemorySensitivity[]; maxAgeMs?:number; }
export interface MemoryStore { put(candidate:MemoryCandidate,policy:MemoryPolicy):Promise<'stored'|'discarded'>; get(userId:string,classes?:MemoryClass[]):Promise<MemoryCandidate[]>; forget(candidateId:string):Promise<void>; }
export class InMemoryMemoryStore implements MemoryStore {
  private readonly values=new Map<string,MemoryCandidate>();
  async put(c:MemoryCandidate,p:MemoryPolicy){if(!p.allowDurable||!p.allowedClasses.includes(c.class)||!p.allowedSensitivity.includes(c.sensitivity)||c.confidence<0.5){return 'discarded';}this.values.set(c.candidateId,c);return 'stored';}
  async get(userId:string,classes?:MemoryClass[]){return [...this.values.values()].filter(v=>v.userId===userId&&(!classes||classes.includes(v.class)));}
  async forget(id:string){this.values.delete(id);}
}