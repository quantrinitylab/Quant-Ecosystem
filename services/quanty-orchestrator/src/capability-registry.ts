import type {QuantyCapabilityManifest,QuantyToolDescriptor} from '@quant/quanty-contracts';
export class QuantyCapabilityRegistry {
 private readonly manifests=new Map<string,QuantyCapabilityManifest>();
 register(manifest:QuantyCapabilityManifest){if(this.manifests.has(manifest.product))throw new Error('CAPABILITY_MANIFEST_EXISTS');this.manifests.set(manifest.product,manifest);return manifest;}
 get(product:string){const m=this.manifests.get(product);if(!m)throw new Error('CAPABILITY_MANIFEST_NOT_FOUND');return m;}
 list(){return [...this.manifests.values()];}
 canExecute(product:string,capability:string,tool:QuantyToolDescriptor){const m=this.get(product);const c=m.capabilities.find(x=>x.name===capability);return !!c&&c.toolIds.includes(tool.toolId)&&c.riskTier===tool.riskTier&&tool.ownerProduct===product;}
}