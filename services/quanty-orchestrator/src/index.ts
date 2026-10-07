import type {QuantyTask,QuantyTaskNode,QuantyTaskStatus} from '@quant/quanty-contracts';
export interface TaskStore {get(id:string):Promise<QuantyTask|undefined>; save(task:QuantyTask):Promise<void>; saveNode(node:QuantyTaskNode):Promise<void>; getNodes(taskId:string):Promise<QuantyTaskNode[]>;}
export class InMemoryTaskStore implements TaskStore {
 private tasks=new Map<string,QuantyTask>(); private nodes=new Map<string,QuantyTaskNode>();
 async get(id:string){return this.tasks.get(id);} async save(t:QuantyTask){this.tasks.set(t.taskId,t);}
 async saveNode(n:QuantyTaskNode){this.nodes.set(n.nodeId,n);} async getNodes(id:string){return [...this.nodes.values()].filter(n=>n.taskId===id);}
}
export class QuantyOrchestrator {
 constructor(private readonly store:TaskStore){}
 async createTask(input:{taskId:string;sessionId:string;goal:string;priority?:number}):Promise<QuantyTask>{const now=new Date().toISOString();const t:QuantyTask={taskId:input.taskId,sessionId:input.sessionId,goal:input.goal,status:'planned',priority:input.priority??5,createdAt:now,updatedAt:now,verificationState:'pending'};await this.store.save(t);return t;}
 async transition(taskId:string,status:QuantyTaskStatus){const t=await this.store.get(taskId);if(!t)throw new Error('TASK_NOT_FOUND');const allowed:Record<QuantyTaskStatus,QuantyTaskStatus[]>= {planned:['waiting','executing','cancelled'],waiting:['executing','cancelled'],executing:['verifying','failed','paused','cancelled','unknown'],verifying:['completed','partial','failed','unknown'],completed:[],partial:[],failed:[],paused:['executing','cancelled'],cancelled:[],unknown:['verifying','executing','cancelled']};if(!allowed[t.status].includes(status))throw new Error('INVALID_TASK_TRANSITION');t.status=status;t.updatedAt=new Date().toISOString();if(status==='completed')t.verificationState='verified';if(status==='unknown')t.verificationState='unknown';await this.store.save(t);return t;}
}