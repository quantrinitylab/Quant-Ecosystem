import type { QuantAppId } from './types';

export const RESOURCE_TYPES = {
  quantmail: ['mail.thread', 'mail.message', 'mail.draft', 'mail.attachment'],
  quantchat: ['chat.conversation', 'chat.message', 'chat.channel', 'chat.call', 'chat.meeting'],
  quantai: ['ai.session', 'ai.plan', 'ai.run', 'ai.artifact', 'ai.approval'],
  quantgram: ['gram.profile', 'gram.post', 'gram.story', 'gram.reel', 'gram.comment'],
  quantwave: ['wave.profile', 'wave.post', 'wave.reply', 'wave.community', 'wave.topic'],
  quantmax: ['max.profile', 'max.discovery', 'max.match', 'max.safety-case'],
  quantube: ['tube.channel', 'tube.video', 'tube.playlist', 'tube.live', 'tube.comment'],
  quantcooks: ['cooks.project', 'cooks.asset', 'cooks.timeline', 'cooks.render', 'cooks.template'],
  quantads: ['ads.campaign', 'ads.adset', 'ads.creative', 'ads.audience', 'ads.boost', 'ads.payout'],
} as const satisfies Record<QuantAppId, readonly string[]>;

export type ResourceTypeMap = typeof RESOURCE_TYPES;

export type QuantResourceType = ResourceTypeMap[QuantAppId][number];

export function isResourceTypeForApp(
  appId: QuantAppId,
  resourceType: string,
): resourceType is QuantResourceType {
  return (RESOURCE_TYPES[appId] as readonly string[]).includes(resourceType);
}
