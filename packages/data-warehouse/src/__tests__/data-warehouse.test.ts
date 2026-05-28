import { NLQueryEngine } from '../query/nl-query.js';
import { DataExporter } from '../export/data-exporter.js';
import { DataResidencyManager } from '../residency/data-residency.js';
describe('NLQueryEngine', () => {
  it('parses NL to structured query and executes', () => {
    const e = new NLQueryEngine();
    const q = e.parse('How many meetings this quarter?');
    expect(q.parsed).toEqual({ metric: 'meetings', period: 'quarter' });
    expect(e.parse('random').parsed).toBeNull();
    expect(e.execute(q).queryId).toBe(q.id);
    expect(e.getSupportedMetrics()).toContain('emails');
  });
});
describe('DataExporter', () => {
  it('export, mark ready, RTBF', () => {
    const ex = new DataExporter();
    const exp = ex.exportApp('app1', 'json');
    expect(exp.status).toBe('pending');
    ex.markReady(exp.id, 1024);
    expect(ex.getExport(exp.id)?.status).toBe('ready');
    ex.supportRTBF('app1');
    expect(ex.getExport(exp.id)?.status).toBe('expired');
  });
});
describe('DataResidencyManager', () => {
  it('track, move, encrypt, query', () => {
    const rm = new DataResidencyManager();
    rm.track('r1', 'eu-west', 's1', false);
    rm.track('r2', 'us-east', 's2', true);
    rm.moveToRegion('r1', 'eu-central');
    expect(rm.getResidency('r1')?.region).toBe('eu-central');
    expect(rm.getUnencrypted()).toHaveLength(1);
    rm.encryptRecord('r1');
    expect(rm.getUnencrypted()).toHaveLength(0);
  });
});
