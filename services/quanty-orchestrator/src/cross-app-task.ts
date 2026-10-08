import type {QuantyTaskNode} from '@quant/quanty-contracts';
export class CrossAppTaskGraph {
 constructor(readonly taskId:string,readonly nodes:QuantyTaskNode[]){}
 ready(completed:Set<string>){return this.nodes.filter(n=>n.status==='planned'&&n.dependsOn.every(d=>completed.has(d)));}
 products(){return [...new Set(this.nodes.map(n=>n.resourceRefs.map(r=>r.split(':')[0])).flat())];}
}