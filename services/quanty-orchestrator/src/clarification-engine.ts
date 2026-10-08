export interface ClarificationCandidate { field:string; question:string; confidence:number; critical:boolean; }
export class QuantyClarificationEngine {
 resolve(candidates:ClarificationCandidate[]){const c=candidates.filter(x=>x.confidence<0.85||x.critical).sort((a,b)=>(a.confidence-b.confidence));return c[0];}
}