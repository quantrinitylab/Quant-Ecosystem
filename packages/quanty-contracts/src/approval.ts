export type QuantyApprovalStatus='pending'|'approved'|'rejected'|'expired'|'cancelled';
export interface QuantyApprovalRequest { approvalId:string; taskId:string; nodeId:string; actionSummary:string; targetSummary:string; consequenceSummary?:string; riskTier:0|1|2|3|4; expiresAt:string; confirmationChannels:Array<'voice'|'touch'|'text'|'biometric'>; status:QuantyApprovalStatus; }
/** A terminal decision a user/system can make on a pending approval. */
export type QuantyApprovalDecision='approved'|'rejected';
