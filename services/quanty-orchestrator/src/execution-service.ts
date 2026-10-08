import type {QuantyToolExecutionContext} from '@quant/quanty-contracts'; import {IdempotencyStore} from './idempotency'; import {CommandAdapterRegistry,QuantyCommand} from './command-adapter';
import type {MemoryStore} from '@quant/quanty-memory';
export class QuantyExecutionService {
 constructor(private readonly adapters:CommandAdapterRegistry,private readonly idempotency:IdempotencyStore,private readonly memory?:MemoryStore){}
 private async remember(context:QuantyToolExecutionContext,command:QuantyCommand,outcome:'completed'|'failed',detail:unknown):Promise<void>{
  if(!this.memory)return;
  try{
   await this.memory.put({
    candidateId:crypto.randomUUID(),
    userId:context.userId??'unknown',
    class:'episodic',
    value:{taskId:context.taskId,nodeId:context.nodeId,capability:command.capability??context.capability,ownerProduct:command.ownerProduct,outcome,detail:typeof detail==='string'?detail:JSON.stringify(detail).slice(0,500)},
    confidence:0.9,
    sensitivity:'normal',
    sourceRef:`quanty:task:${context.taskId}`,
    createdAt:new Date().toISOString(),
   },{allowDurable:true,allowedClasses:['episodic'],allowedSensitivity:['normal']});
  }catch{/* episodic memory is best-effort; it must never fail command execution */}
 }
 async execute(command:QuantyCommand,context:QuantyToolExecutionContext){const existing=this.idempotency.get(command.idempotencyKey);if(existing?.status==='completed')return existing.result;if(existing?.status==='running')throw new Error('IDEMPOTENCY_IN_PROGRESS');this.idempotency.put({key:command.idempotencyKey,fingerprint:JSON.stringify(command.payload),status:'running',createdAt:new Date().toISOString()});try{const adapter=this.adapters.get(command.ownerProduct);const accepted=await adapter.execute(command);if(!accepted.accepted)throw new Error('COMMAND_REJECTED');const verification=await adapter.verify(command);if(!verification.verified)throw new Error('VERIFICATION_FAILED');const result={...accepted,result:verification.state};this.idempotency.put({key:command.idempotencyKey,fingerprint:JSON.stringify(command.payload),status:'completed',result,createdAt:new Date().toISOString()});await this.remember(context,command,'completed',result);return result;}catch(error){this.idempotency.put({key:command.idempotencyKey,fingerprint:JSON.stringify(command.payload),status:'failed',error:error instanceof Error?error.message:String(error),createdAt:new Date().toISOString()});await this.remember(context,command,'failed',error instanceof Error?error.message:String(error));throw error;}}
}
