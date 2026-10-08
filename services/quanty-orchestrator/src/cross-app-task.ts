import type {QuantyTaskNode} from '@quant/quanty-contracts';
import type {CapabilityMatrix,PlatformCapabilities} from '@quant/quanty-platform';
export class CrossAppTaskGraph {
 constructor(readonly taskId:string,readonly nodes:QuantyTaskNode[]){}
 ready(completed:Set<string>){return this.nodes.filter(n=>n.status==='planned'&&n.dependsOn.every(d=>completed.has(d)));}
 products(){return [...new Set(this.nodes.map(n=>n.resourceRefs.map(r=>r.split(':')[0])).flat())];}
 /**
  * Platform-aware readiness: a node that needs deep navigation or a
  * persistent surface is only ready on platforms whose adapter declares
  * the capability. Nodes without platform-sensitive needs are unaffected.
  */
 readyOnPlatform(completed:Set<string>,platform:PlatformCapabilities['platform'],matrix:CapabilityMatrix):QuantyTaskNode[]{
  const adapter=matrix.get(platform);
  return this.ready(completed).filter((node)=>{
   const needsNavigation=node.capability.includes('navigation')||node.capability.includes('navigate');
   const needsSurface=node.riskTier>=3;
   if(needsNavigation&&!adapter?.capabilities.deepNavigation)return false;
   if(needsSurface&&!adapter?.capabilities.persistentSurface)return false;
   return true;
  });
 }
}
