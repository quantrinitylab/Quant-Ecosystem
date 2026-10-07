import type {QuantyApprovalRequest} from '@quant/quanty-contracts';
export class QuantyConfirmationEngine {
 shouldConfirm(risk:0|1|2|3|4,policy:'never'|'conditional'|'always'){return policy==='always'||(policy==='conditional'&&risk>=3);}
 build(input:{approvalId:string;taskId:string;nodeId:string;action:string;target:string;consequence?:string;riskTier:0|1|2|3|4;expiresAt:string}):QuantyApprovalRequest{return {approvalId:input.approvalId,taskId:input.taskId,nodeId:input.nodeId,actionSummary:input.action,targetSummary:input.target,consequenceSummary:input.consequence,riskTier:input.riskTier,expiresAt:input.expiresAt,confirmationChannels:['voice','touch','text'],status:'pending'};}
}