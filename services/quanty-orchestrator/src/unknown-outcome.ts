export type UnknownOutcomeState='unknown'|'verifying'|'verified'|'retryable'|'terminal';
export interface UnknownOutcome {operationId:string;state:UnknownOutcomeState;reason:string;lastAttemptAt:string;verificationDeadlineAt:string;}
export class UnknownOutcomeResolver {
 markUnknown(operationId:string,reason:string,deadlineMs=30000):UnknownOutcome{const now=Date.now();return {operationId,state:'unknown',reason,lastAttemptAt:new Date(now).toISOString(),verificationDeadlineAt:new Date(now+deadlineMs).toISOString()};}
 next(outcome:UnknownOutcome,verified:boolean,now=Date.now()):UnknownOutcome{if(verified)return {...outcome,state:'verified'};if(now<Date.parse(outcome.verificationDeadlineAt))return {...outcome,state:'verifying'};return {...outcome,state:'retryable'};}
}