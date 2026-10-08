import type { QuantySession, QuantyTask } from '@quant/quanty-contracts';

export interface QuantyClientTransport {
  send<T>(method:string, payload:unknown):Promise<T>;
}

export class QuantyClient {
  constructor(private readonly transport: QuantyClientTransport) {}
  startSession(input: Pick<QuantySession,'userId'|'mode'|'platform'> & {tenantId?:string}) {
    return this.transport.send<QuantySession>('session.start', input);
  }
  createTask(input: Pick<QuantyTask,'sessionId'|'goal'|'priority'>) {
    return this.transport.send<QuantyTask>('task.create', input);
  }
  cancelTask(taskId:string) { return this.transport.send<QuantyTask>('task.cancel',{taskId}); }
  navigate(input:unknown) { return this.transport.send('navigation.request',input); }
  approve(approvalId:string) { return this.transport.send('approval.resolve',{approvalId,decision:'approved'}); }
  reject(approvalId:string) { return this.transport.send('approval.resolve',{approvalId,decision:'rejected'}); }
}