import { NewsMonitorAgent } from '../agents/news-monitor.js';

describe('NewsMonitorAgent', () => {
  let agent: NewsMonitorAgent;

  beforeEach(() => {
    agent = new NewsMonitorAgent();
  });

  it('configures topics and sources', () => {
    agent.configure(['crypto', 'stocks'], ['reuters', 'bloomberg'], 60000);
    const config = agent.getConfig();
    expect(config.topics).toEqual(['crypto', 'stocks']);
    expect(config.sources).toEqual(['reuters', 'bloomberg']);
    expect(config.frequency).toBe(60000);
  });

  it('check() returns items for each topic-source pair', () => {
    agent.configure(['ai', 'finance'], ['techcrunch'], 60000);
    const items = agent.check();
    expect(items).toHaveLength(2);
    expect(items[0]!.topic).toBe('ai');
    expect(items[1]!.topic).toBe('finance');
    expect(items[0]!.source).toBe('techcrunch');
  });

  it('getDigest groups items by topic', () => {
    agent.configure(['tech', 'health'], ['cnn', 'bbc'], 60000);
    const since = Date.now() - 1000;
    agent.check();
    const digest = agent.getDigest(since);
    expect(digest.groups['tech']).toBeDefined();
    expect(digest.groups['health']).toBeDefined();
    expect(digest.groups['tech']!.length).toBe(2);
    expect(digest.groups['health']!.length).toBe(2);
    expect(digest.totalItems).toBe(4);
  });

  it('getDigest filters items older than since', () => {
    agent.configure(['news'], ['ap'], 60000);
    agent.check();
    const futureTime = Date.now() + 100000;
    const digest = agent.getDigest(futureTime);
    expect(digest.totalItems).toBe(0);
  });
});
