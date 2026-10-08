import type {QuantyTaskNode} from '@quant/quanty-contracts';
export interface PlannedAction {nodeId:string;toolId:string;capability:string;resourceRefs:string[];riskTier:0|1|2|3|4;dependsOn:string[];requiresClarification?:boolean;clarificationQuestion?:string;}
export class QuantyTaskPlanner {
 plan(taskId:string,_goal:string,actions:PlannedAction[]):QuantyTaskNode[]{return actions.map(a=>({nodeId:a.nodeId,taskId,kind:a.riskTier>=3?'mutate':'read',status:'planned',dependsOn:a.dependsOn,capability:a.capability,resourceRefs:a.resourceRefs,inputRef:undefined,outputRef:undefined,riskTier:a.riskTier,idempotencyKey:taskId+':'+a.nodeId,retryPolicy:{maxAttempts:2,backoffMs:250}}));}
 clarification(actions:PlannedAction[]){const ambiguous=actions.find(a=>a.requiresClarification);return ambiguous?.clarificationQuestion;}
}