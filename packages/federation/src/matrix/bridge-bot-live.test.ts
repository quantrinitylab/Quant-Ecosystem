import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatrixBridgeBot } from './bridge-bot.js';
import { RoomMapper, InMemoryRoomMappingStore } from './room-mapper.js';

const mockSendMessage = vi.fn().mockResolvedValue('$event-id');
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockGetUserId = vi.fn().mockResolvedValue('@bot:matrix.example.com');
const mockOn = vi.fn();

// Mock matrix-bot-sdk
vi.mock('matrix-bot-sdk', () => {
  const MockMatrixClient = vi.fn(function (this: Record<string, unknown>) {
    this.start = mockStart;
    this.stop = mockStop;
    this.getUserId = mockGetUserId;
    this.sendMessage = mockSendMessage;
    this.on = mockOn;
  });

  return {
    MatrixClient: MockMatrixClient,
    AutojoinRoomsMixin: {
      setupOnClient: vi.fn(),
    },
  };
});

describe('MatrixBridgeBot (Live Mode)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env['MATRIX_HOMESERVER_URL'] = 'https://matrix.example.com';
    process.env['MATRIX_BOT_TOKEN'] = 'test-bot-token';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects Matrix config from environment variables', () => {
    const bot = new MatrixBridgeBot();
    expect(bot).toBeDefined();
  });

  it('starts and connects to Matrix homeserver', async () => {
    const bot = new MatrixBridgeBot();
    await bot.start();

    expect(bot.isConnected()).toBe(true);
    expect(mockStart).toHaveBeenCalled();
  });

  it('stops cleanly', async () => {
    const bot = new MatrixBridgeBot();
    await bot.start();
    await bot.stop();

    expect(bot.isConnected()).toBe(false);
    expect(mockStop).toHaveBeenCalled();
  });

  it('sends messages to Matrix when connected', async () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-1', '!room1:matrix.example.com', 'dm');

    const bot = new MatrixBridgeBot(mapper);
    await bot.start();

    bot.onQuantMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Hello Matrix!',
    });

    // Allow the async sendMessage to be called
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSendMessage).toHaveBeenCalledWith('!room1:matrix.example.com', {
      msgtype: 'm.text',
      body: 'Hello Matrix!',
    });
  });

  it('registers room.message listener on start', async () => {
    const bot = new MatrixBridgeBot();
    await bot.start();

    expect(mockOn).toHaveBeenCalledWith('room.message', expect.any(Function));
  });

  it('handles incoming Matrix messages via listener', async () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-2', '!room2:matrix.example.com', 'group');

    const bot = new MatrixBridgeBot(mapper);
    await bot.start();

    // Find the registered room.message handler
    const onCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'room.message');
    expect(onCall).toBeDefined();
    const messageHandler = onCall![1] as (roomId: string, event: Record<string, unknown>) => void;

    messageHandler('!room2:matrix.example.com', {
      sender: '@alice:matrix.example.com',
      content: { body: 'Hello from Matrix' },
    });

    const messages = bot.getForwardedMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.direction).toBe('matrix-to-quant');
    expect(messages[0]!.destination).toBe('conv-2');
    expect(messages[0]!.content).toBe('Hello from Matrix');
  });

  it('ignores messages from the bot itself', async () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-3', '!room3:matrix.example.com', 'dm');

    const bot = new MatrixBridgeBot(mapper);
    await bot.start();

    const onCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'room.message');
    expect(onCall).toBeDefined();
    const messageHandler = onCall![1] as (roomId: string, event: Record<string, unknown>) => void;

    // Message from the bot itself should be ignored
    messageHandler('!room3:matrix.example.com', {
      sender: '@bot:matrix.example.com',
      content: { body: 'My own message' },
    });

    expect(bot.getForwardedMessages()).toHaveLength(0);
  });

  it('ignores messages with no content', async () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-4', '!room4:matrix.example.com', 'dm');

    const bot = new MatrixBridgeBot(mapper);
    await bot.start();

    const onCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'room.message');
    const messageHandler = onCall![1] as (roomId: string, event: Record<string, unknown>) => void;

    messageHandler('!room4:matrix.example.com', {
      sender: '@someone:matrix.example.com',
      content: null,
    });

    expect(bot.getForwardedMessages()).toHaveLength(0);
  });
});

describe('MatrixBridgeBot (Simulation Mode)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env['MATRIX_HOMESERVER_URL'];
    delete process.env['MATRIX_BOT_TOKEN'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('runs in simulation mode without env vars', async () => {
    const bot = new MatrixBridgeBot();
    await bot.start();

    expect(bot.isConnected()).toBe(false);
  });

  it('still forwards messages in-memory in simulation mode', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-sim', '!sim-room:matrix.local', 'dm');

    const bot = new MatrixBridgeBot(mapper);
    bot.onQuantMessage({
      conversationId: 'conv-sim',
      senderId: 'user-sim',
      content: 'Simulated message',
    });

    const messages = bot.getForwardedMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe('Simulated message');
  });

  it('handles Matrix-to-Quant in simulation mode', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-sim2', '!sim-room2:matrix.local', 'group');

    const bot = new MatrixBridgeBot(mapper);
    const result = bot.onMatrixMessage({
      roomId: '!sim-room2:matrix.local',
      sender: '@user:matrix.local',
      content: 'Sim matrix message',
    });

    expect(result.forwarded).toBe(true);
  });
});

describe('RoomMapper with InMemoryRoomMappingStore', () => {
  it('uses InMemoryRoomMappingStore by default', () => {
    const mapper = new RoomMapper();
    expect(mapper.getStore()).toBeInstanceOf(InMemoryRoomMappingStore);
  });

  it('accepts a custom store', () => {
    const store = new InMemoryRoomMappingStore();
    const mapper = new RoomMapper(store);
    expect(mapper.getStore()).toBe(store);
  });

  it('creates and retrieves mappings through the store', () => {
    const store = new InMemoryRoomMappingStore();
    const mapper = new RoomMapper(store);

    mapper.createMapping('conv-store', '!room-store:matrix.org', 'group');

    expect(mapper.getMatrixRoom('conv-store')).toBe('!room-store:matrix.org');
    expect(mapper.getQuantConversation('!room-store:matrix.org')).toBe('conv-store');
    expect(mapper.getMappingType('conv-store')).toBe('group');
  });

  it('removes mappings through the store', () => {
    const store = new InMemoryRoomMappingStore();
    const mapper = new RoomMapper(store);

    mapper.createMapping('conv-rm', '!room-rm:matrix.org', 'dm');
    mapper.removeMapping('conv-rm');

    expect(mapper.getMatrixRoom('conv-rm')).toBeUndefined();
    expect(mapper.getQuantConversation('!room-rm:matrix.org')).toBeUndefined();
  });

  it('prevents duplicate quant conversation mappings', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-dup', '!room-dup:matrix.org', 'dm');

    expect(() => mapper.createMapping('conv-dup', '!room-other:matrix.org', 'group')).toThrow(
      'Mapping already exists for Quant conversation',
    );
  });

  it('prevents duplicate matrix room mappings', () => {
    const mapper = new RoomMapper();
    mapper.createMapping('conv-a', '!room-shared:matrix.org', 'dm');

    expect(() => mapper.createMapping('conv-b', '!room-shared:matrix.org', 'group')).toThrow(
      'Mapping already exists for Matrix room',
    );
  });
});
