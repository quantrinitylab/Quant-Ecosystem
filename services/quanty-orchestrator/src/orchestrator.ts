import type {QuantyTask,QuantyTaskStatus} from '@quant/quanty-contracts';
/** Minimal in-memory task store backing QuantyOrchestrator. */
export class InMemoryTaskStore {
 private readonly tasks=new Map<string,QuantyTask>();
 get(taskId:string){return this.tasks.get(taskId);}
 set(task:QuantyTask){this.tasks.set(task.taskId,task);return task;}
}
/** Allowed task lifecycle transitions. Verification is mandatory: a task can
 * only reach `completed` through `verifying`, which marks it verified. */
const ALLOWED:Record<QuantyTaskStatus,QuantyTaskStatus[]>={
 planned:['waiting','executing','cancelled'],
 waiting:['executing','cancelled'],
 executing:['verifying','failed','paused','cancelled'],
 verifying:['completed','failed','executing'],
 completed:[],
 partial:['executing','cancelled'],
 failed:['executing'],
 paused:['executing','cancelled'],
 cancelled:[],
 unknown:[],
};
export class QuantyOrchestrator {
 constructor(private readonly store:InMemoryTaskStore){}
 async createTask(input:{taskId:string;sessionId:string;goal:string;}):Promise<QuantyTask>{
  const now=new Date().toISOString();
  const task:QuantyTask={taskId:input.taskId,sessionId:input.sessionId,goal:input.goal,status:'planned',priority:0,createdAt:now,updatedAt:now,verificationState:'pending'};
  return this.store.set(task);
 }
 async transition(taskId:string,to:QuantyTaskStatus):Promise<QuantyTask>{
  const task=this.store.get(taskId);
  if(!task)throw new Error('TASK_NOT_FOUND');
  if(!ALLOWED[task.status].includes(to))throw new Error('INVALID_TASK_TRANSITION');
  task.status=to;
  task.updatedAt=new Date().toISOString();
  if(to==='completed')task.verificationState='verified';
  if(to==='failed')task.verificationState='unknown';
  return this.store.set(task);
 }
}
