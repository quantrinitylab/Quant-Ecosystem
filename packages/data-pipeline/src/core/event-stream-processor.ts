// ============================================================================
// Data Pipeline Package - Event Stream Processor
// ============================================================================

import type {
  Topic,
  Partition,
  ConsumerGroup,
  ConsumerGroupMember,
  PartitionAssignment,
  ConsumerGroupState,
  AssignmentStrategy,
  Offset,
  OffsetReset,
  Message,
  MessageBatch,
  SubscriptionHandler,
} from '../types';

/** Internal storage for topic data */
interface TopicStore {
  topic: Topic;
  partitions: Map<number, PartitionData>;
}

/** Data for a single partition */
interface PartitionData {
  messages: Message[];
  highWatermark: number;
}

/** Active subscription */
interface Subscription {
  groupId: string;
  handler: SubscriptionHandler;
  topics: string[];
  offsetReset: OffsetReset;
}

/**
 * EventStreamProcessor - Kafka-like event streaming engine
 * Provides topic management, publish/subscribe, consumer groups,
 * partition assignment, and offset tracking.
 */
export class EventStreamProcessor {
  private topics: Map<string, TopicStore> = new Map();
  private consumerGroups: Map<string, ConsumerGroup> = new Map();
  private subscriptions: Map<string, Subscription[]> = new Map();
  private committedOffsets: Map<string, Map<string, Offset>> = new Map();
  private messageCounter: number = 0;

  /**
   * Create a new topic with specified configuration
   */
  public createTopic(
    name: string,
    partitions: number = 4,
    replicationFactor: number = 3,
    retentionMs: number = 604800000
  ): Topic {
    if (this.topics.has(name)) {
      throw new Error(`Topic '${name}' already exists`);
    }

    const topic: Topic = {
      name,
      partitions,
      replicationFactor,
      retentionMs,
      compactionEnabled: false,
      maxMessageSize: 1048576,
      createdAt: Date.now(),
    };

    const partitionMap = new Map<number, PartitionData>();
    for (let i = 0; i < partitions; i++) {
      partitionMap.set(i, { messages: [], highWatermark: 0 });
    }

    this.topics.set(name, { topic, partitions: partitionMap });
    return topic;
  }

  /**
   * Delete a topic and all its data
   */
  public deleteTopic(name: string): boolean {
    if (!this.topics.has(name)) {
      return false;
    }

    this.topics.delete(name);

    // Remove subscriptions for this topic
    for (const [groupId, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => !s.topics.includes(name));
      if (filtered.length === 0) {
        this.subscriptions.delete(groupId);
      } else {
        this.subscriptions.set(groupId, filtered);
      }
    }

    return true;
  }

  /**
   * Publish a message to a topic
   * Uses key-based partitioning if key is provided, otherwise round-robin
   */
  public publish(
    topicName: string,
    key: string | null,
    value: unknown,
    headers: Record<string, string> = {}
  ): Message {
    const topicStore = this.topics.get(topicName);
    if (!topicStore) {
      throw new Error(`Topic '${topicName}' does not exist`);
    }

    const partitionId = this.selectPartition(key, topicStore.topic.partitions);
    const partition = topicStore.partitions.get(partitionId)!;

    const message: Message = {
      key,
      value,
      topic: topicName,
      partition: partitionId,
      offset: partition.highWatermark,
      timestamp: Date.now(),
      headers,
    };

    partition.messages.push(message);
    partition.highWatermark++;
    this.messageCounter++;

    // Deliver to subscribers
    this.deliverToSubscribers(topicName, message);

    return message;
  }

  /**
   * Publish a batch of messages efficiently
   */
  public publishBatch(
    topicName: string,
    messages: Array<{ key: string | null; value: unknown; headers?: Record<string, string> }>
  ): MessageBatch {
    const topicStore = this.topics.get(topicName);
    if (!topicStore) {
      throw new Error(`Topic '${topicName}' does not exist`);
    }

    const published: Message[] = [];
    for (const msg of messages) {
      const result = this.publish(topicName, msg.key, msg.value, msg.headers || {});
      published.push(result);
    }

    return {
      messages: published,
      topic: topicName,
      partition: published[0]?.partition ?? 0,
      firstOffset: published[0]?.offset ?? 0,
      lastOffset: published[published.length - 1]?.offset ?? 0,
      batchSize: published.length,
    };
  }

  /**
   * Subscribe to one or more topics as part of a consumer group
   */
  public subscribe(
    groupId: string,
    topics: string[],
    handler: SubscriptionHandler,
    offsetReset: OffsetReset = 'latest'
  ): void {
    // Validate topics exist
    for (const topic of topics) {
      if (!this.topics.has(topic)) {
        throw new Error(`Topic '${topic}' does not exist`);
      }
    }

    // Create or get consumer group
    if (!this.consumerGroups.has(groupId)) {
      this.consumerGroups.set(groupId, {
        groupId,
        members: [],
        state: 'stable',
        assignmentStrategy: 'round-robin',
        generationId: 1,
        coordinatorId: 'coord-0',
      });
    }

    const group = this.consumerGroups.get(groupId)!;
    const memberId = `member-${group.members.length}-${Date.now()}`;

    const member: ConsumerGroupMember = {
      memberId,
      clientId: `client-${memberId}`,
      assignedPartitions: [],
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    group.members.push(member);

    const subscription: Subscription = {
      groupId,
      handler,
      topics,
      offsetReset,
    };

    if (!this.subscriptions.has(groupId)) {
      this.subscriptions.set(groupId, []);
    }
    this.subscriptions.get(groupId)!.push(subscription);

    // Trigger rebalance
    this.rebalanceGroup(groupId, topics);

    // Send existing messages based on offset reset
    if (offsetReset === 'earliest') {
      this.replayFromBeginning(topics, handler);
    }
  }

  /**
   * Unsubscribe a consumer group from topics
   */
  public unsubscribe(groupId: string): void {
    this.subscriptions.delete(groupId);
    const group = this.consumerGroups.get(groupId);
    if (group) {
      group.state = 'empty';
      group.members = [];
    }
  }

  /**
   * Commit offset for a consumer group
   */
  public commitOffset(
    groupId: string,
    topicName: string,
    partitionId: number,
    offset: number
  ): Offset {
    const offsetKey = `${groupId}:${topicName}:${partitionId}`;
    const committedOffset: Offset = {
      topicName,
      partitionId,
      offset,
      metadata: groupId,
      committedAt: Date.now(),
    };

    if (!this.committedOffsets.has(groupId)) {
      this.committedOffsets.set(groupId, new Map());
    }
    this.committedOffsets.get(groupId)!.set(offsetKey, committedOffset);

    return committedOffset;
  }

  /**
   * Get consumer group lag (difference between high watermark and committed offset)
   */
  public getConsumerGroupLag(groupId: string): Map<string, number> {
    const lag = new Map<string, number>();
    const offsets = this.committedOffsets.get(groupId);

    if (!offsets) {
      return lag;
    }

    for (const [key, offset] of offsets.entries()) {
      const topicStore = this.topics.get(offset.topicName);
      if (topicStore) {
        const partition = topicStore.partitions.get(offset.partitionId);
        if (partition) {
          lag.set(key, partition.highWatermark - offset.offset);
        }
      }
    }

    return lag;
  }

  /**
   * Get topic metadata
   */
  public getTopicInfo(name: string): Topic | null {
    const store = this.topics.get(name);
    return store ? store.topic : null;
  }

  /**
   * Get partition information for a topic
   */
  public getPartitions(topicName: string): Partition[] {
    const topicStore = this.topics.get(topicName);
    if (!topicStore) {
      return [];
    }

    const partitions: Partition[] = [];
    for (const [id, data] of topicStore.partitions.entries()) {
      partitions.push({
        id,
        topicName,
        leader: 'broker-0',
        replicas: ['broker-0', 'broker-1', 'broker-2'],
        inSyncReplicas: ['broker-0', 'broker-1', 'broker-2'],
        highWatermark: data.highWatermark,
        logStartOffset: 0,
      });
    }

    return partitions;
  }

  /**
   * Get messages from a specific partition starting at an offset
   */
  public consume(
    topicName: string,
    partitionId: number,
    fromOffset: number,
    maxMessages: number = 100
  ): Message[] {
    const topicStore = this.topics.get(topicName);
    if (!topicStore) {
      return [];
    }

    const partition = topicStore.partitions.get(partitionId);
    if (!partition) {
      return [];
    }

    return partition.messages.slice(fromOffset, fromOffset + maxMessages);
  }

  /**
   * Select partition based on key or round-robin
   */
  private selectPartition(key: string | null, numPartitions: number): number {
    if (key === null) {
      return this.messageCounter % numPartitions;
    }

    // Murmur-like hash for consistent partitioning
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash) % numPartitions;
  }

  /**
   * Rebalance partition assignments across consumer group members
   */
  private rebalanceGroup(groupId: string, topics: string[]): void {
    const group = this.consumerGroups.get(groupId);
    if (!group || group.members.length === 0) {
      return;
    }

    group.state = 'rebalancing';
    group.generationId++;

    // Collect all partitions
    const allPartitions: PartitionAssignment[] = [];
    for (const topicName of topics) {
      const topicStore = this.topics.get(topicName);
      if (topicStore) {
        for (let i = 0; i < topicStore.topic.partitions; i++) {
          allPartitions.push({ topicName, partitionId: i });
        }
      }
    }

    // Clear existing assignments
    for (const member of group.members) {
      member.assignedPartitions = [];
    }

    // Assign based on strategy
    switch (group.assignmentStrategy) {
      case 'round-robin':
        this.roundRobinAssign(group.members, allPartitions);
        break;
      case 'range':
        this.rangeAssign(group.members, allPartitions);
        break;
      case 'sticky':
        this.stickyAssign(group.members, allPartitions);
        break;
    }

    group.state = 'stable';

    // Notify subscribers of rebalance
    const subs = this.subscriptions.get(groupId);
    if (subs) {
      for (const sub of subs) {
        if (sub.handler.onRebalance) {
          sub.handler.onRebalance(allPartitions);
        }
      }
    }
  }

  /**
   * Round-robin partition assignment
   */
  private roundRobinAssign(
    members: ConsumerGroupMember[],
    partitions: PartitionAssignment[]
  ): void {
    for (let i = 0; i < partitions.length; i++) {
      const memberIdx = i % members.length;
      members[memberIdx].assignedPartitions.push(partitions[i]);
    }
  }

  /**
   * Range-based partition assignment
   */
  private rangeAssign(
    members: ConsumerGroupMember[],
    partitions: PartitionAssignment[]
  ): void {
    const partitionsPerMember = Math.floor(partitions.length / members.length);
    const remainder = partitions.length % members.length;

    let offset = 0;
    for (let i = 0; i < members.length; i++) {
      const count = partitionsPerMember + (i < remainder ? 1 : 0);
      members[i].assignedPartitions = partitions.slice(offset, offset + count);
      offset += count;
    }
  }

  /**
   * Sticky partition assignment (preserves existing assignments)
   */
  private stickyAssign(
    members: ConsumerGroupMember[],
    partitions: PartitionAssignment[]
  ): void {
    // For simplicity, sticky falls back to round-robin on fresh assignment
    this.roundRobinAssign(members, partitions);
  }

  /**
   * Deliver message to all matching subscribers
   */
  private deliverToSubscribers(topicName: string, message: Message): void {
    for (const [_groupId, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (sub.topics.includes(topicName)) {
          try {
            sub.handler.onMessage(message);
          } catch (error) {
            sub.handler.onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }
  }

  /**
   * Replay all messages from the beginning for new subscribers
   */
  private replayFromBeginning(topics: string[], handler: SubscriptionHandler): void {
    for (const topicName of topics) {
      const topicStore = this.topics.get(topicName);
      if (!topicStore) continue;

      for (const [_partitionId, data] of topicStore.partitions.entries()) {
        for (const message of data.messages) {
          try {
            handler.onMessage(message);
          } catch (error) {
            handler.onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }
  }
}
