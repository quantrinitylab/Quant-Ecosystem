import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStickerPack,
  addStickerToPack,
  getStickerPack,
  listStickerPacks,
  parseMessageStickers,
  startVoiceBroadcast,
  joinBroadcast,
  leaveBroadcast,
  stopVoiceBroadcast,
  getVoiceBroadcast,
  clearStickersAndBroadcastsForTesting,
  StickerBroadcastService,
} from '../services/sticker-pack.service';

describe('Grupo Chat v3.15 Custom Sticker Pack Engine & Live Voice Broadcast Manager', () => {
  beforeEach(() => {
    clearStickersAndBroadcastsForTesting();
  });

  describe('Custom Sticker Pack Engine', () => {
    it('creates sticker pack and adds animated and static stickers', () => {
      const pack = createStickerPack({
        name: 'Quant Galactic Expressions',
        author: 'Astra & Quant Studio',
        thumbnailUrl: 'https://cdn.quant.chat/packs/galactic/thumb.png',
        isOfficial: true,
      });

      expect(pack).toBeDefined();
      expect(pack.id).toMatch(/^pack_\d+_[a-z0-9]+$/);
      expect(pack.name).toBe('Quant Galactic Expressions');
      expect(pack.author).toBe('Astra & Quant Studio');
      expect(pack.isOfficial).toBe(true);
      expect(pack.downloadCount).toBe(0);
      expect(pack.stickers).toEqual([]);

      // Add static SVG sticker
      const staticSticker = addStickerToPack(pack.id, {
        code: ':quant_rocket:',
        imageUrl: 'https://cdn.quant.chat/packs/galactic/rocket.svg',
        isAnimated: false,
        tags: ['rocket', 'space', 'launch', 'bullish'],
      });

      expect(staticSticker.id).toMatch(/^sticker_\d+_[a-z0-9]+$/);
      expect(staticSticker.packId).toBe(pack.id);
      expect(staticSticker.code).toBe(':quant_rocket:');
      expect(staticSticker.imageUrl).toBe('https://cdn.quant.chat/packs/galactic/rocket.svg');
      expect(staticSticker.isAnimated).toBe(false);
      expect(staticSticker.tags).toContain('launch');

      // Add animated WebP sticker
      const animatedSticker = addStickerToPack(pack.id, {
        code: ':neon_party:',
        imageUrl: 'https://cdn.quant.chat/packs/galactic/party.webp',
        isAnimated: true,
        tags: ['party', 'celebrate', 'hype'],
      });

      expect(animatedSticker.isAnimated).toBe(true);

      // Verify retrieval
      const retrieved = getStickerPack(pack.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.stickers).toHaveLength(2);
      expect(retrieved?.stickers[0].code).toBe(':quant_rocket:');
      expect(retrieved?.stickers[1].code).toBe(':neon_party:');

      // Verify list
      const allPacks = listStickerPacks();
      expect(allPacks).toHaveLength(1);
      expect(allPacks[0].id).toBe(pack.id);
    });

    it('throws error when adding sticker to non-existent pack', () => {
      expect(() => {
        addStickerToPack('non_existent_pack', {
          code: ':invalid:',
          imageUrl: 'https://cdn.quant.chat/invalid.png',
        });
      }).toThrowError(/Sticker pack not found/);
    });

    it('normalizes sticker codes without colons', () => {
      const pack = createStickerPack({
        name: 'Retro Emojis',
        author: 'Grupo Designer',
        thumbnailUrl: 'https://cdn.quant.chat/retro/thumb.png',
      });

      const sticker = addStickerToPack(pack.id, {
        code: 'thumbs_up',
        imageUrl: 'https://cdn.quant.chat/retro/thumbs_up.png',
      });

      expect(sticker.code).toBe(':thumbs_up:');
    });

    it('detects embedded sticker codes and resolves them with parseMessageStickers', () => {
      const pack = createStickerPack({
        name: 'Community Badges',
        author: 'Alice',
        thumbnailUrl: 'https://cdn.quant.chat/badges/thumb.png',
      });

      addStickerToPack(pack.id, {
        code: ':quant_rocket:',
        imageUrl: 'https://cdn.quant.chat/stickers/rocket.png',
        isAnimated: true,
        tags: ['rocket'],
      });

      addStickerToPack(pack.id, {
        code: ':gold_medal:',
        imageUrl: 'https://cdn.quant.chat/stickers/gold.png',
        isAnimated: false,
        tags: ['gold', 'winner'],
      });

      const message = 'LFG team :quant_rocket: you all earned a :gold_medal: today! :unknown_tag:';
      const result = parseMessageStickers(message);

      expect(result.stickersFound).toHaveLength(2);
      expect(result.stickersFound.map((s) => s.code)).toEqual([':quant_rocket:', ':gold_medal:']);

      // Resolved rich markup
      expect(result.parsedContent).toContain('<img class="chat-sticker"');
      expect(result.parsedContent).toContain('https://cdn.quant.chat/stickers/rocket.png');
      expect(result.parsedContent).toContain('https://cdn.quant.chat/stickers/gold.png');
      // Unknown tags are preserved as raw text
      expect(result.parsedContent).toContain(':unknown_tag:');
    });

    it('handles empty message content gracefully', () => {
      const result = parseMessageStickers('');
      expect(result.parsedContent).toBe('');
      expect(result.stickersFound).toEqual([]);
    });
  });

  describe('Live Voice Broadcast Channel Manager', () => {
    it('starts broadcast setting host and initial listener/speaker state', () => {
      const channel = startVoiceBroadcast(
        'chan_announcements',
        'user_ceo_astra',
        'Ecosystem Townhall & Live Q&A',
        'https://cdn.quant.chat/ambient/synthwave-lounge.mp3',
      );

      expect(channel).toBeDefined();
      expect(channel.channelId).toBe('chan_announcements');
      expect(channel.title).toBe('Ecosystem Townhall & Live Q&A');
      expect(channel.hostUserId).toBe('user_ceo_astra');
      expect(channel.isLive).toBe(true);
      expect(channel.speakers).toEqual(['user_ceo_astra']);
      expect(channel.listenersCount).toBe(0);
      expect(channel.ambientTrackUrl).toBe('https://cdn.quant.chat/ambient/synthwave-lounge.mp3');
      expect(channel.startedAt).toBeDefined();

      const lookup = getVoiceBroadcast('chan_announcements');
      expect(lookup).toEqual(channel);
    });

    it('updates counts and speaker roles when users join and leave broadcast', () => {
      startVoiceBroadcast('chan_crypto_alpha', 'user_host_dan', 'Market Deep Dive');

      // User 1 joins as listener (audience)
      const afterUser1 = joinBroadcast('chan_crypto_alpha', 'user_bob', false);
      expect(afterUser1.listenersCount).toBe(1);
      expect(afterUser1.speakers).toEqual(['user_host_dan']);

      // User 2 joins as listener
      const afterUser2 = joinBroadcast('chan_crypto_alpha', 'user_charlie');
      expect(afterUser2.listenersCount).toBe(2);
      expect(afterUser2.speakers).toEqual(['user_host_dan']);

      // User 3 joins directly as speaker (co-host / panelist)
      const afterSpeaker3 = joinBroadcast('chan_crypto_alpha', 'user_diana', true);
      expect(afterSpeaker3.speakers).toContain('user_diana');
      expect(afterSpeaker3.speakers).toContain('user_host_dan');
      expect(afterSpeaker3.listenersCount).toBe(2);

      // User 2 (charlie) is invited to speaker stage
      const afterPromote2 = joinBroadcast('chan_crypto_alpha', 'user_charlie', true);
      expect(afterPromote2.speakers).toContain('user_charlie');
      expect(afterPromote2.listenersCount).toBe(1); // Charlie left audience for stage

      // Speaker leaves broadcast
      const afterSpeakerLeaves = leaveBroadcast('chan_crypto_alpha', 'user_diana');
      expect(afterSpeakerLeaves.speakers).not.toContain('user_diana');
      expect(afterSpeakerLeaves.speakers).toEqual(['user_host_dan', 'user_charlie']);

      // Listener leaves broadcast
      const afterListenerLeaves = leaveBroadcast('chan_crypto_alpha', 'user_bob');
      expect(afterListenerLeaves.listenersCount).toBe(0);
    });

    it('stops broadcast marking channel ended only when authorized by host', () => {
      startVoiceBroadcast('chan_stage_01', 'user_lead_host', 'Keynote Address');

      // Unauthorized stop attempt by another user
      const unauthorizedStop = stopVoiceBroadcast('chan_stage_01', 'user_impostor');
      expect(unauthorizedStop).toBe(false);

      const stillLive = getVoiceBroadcast('chan_stage_01');
      expect(stillLive?.isLive).toBe(true);

      // Authorized stop by host
      const stopped = stopVoiceBroadcast('chan_stage_01', 'user_lead_host');
      expect(stopped).toBe(true);

      const stoppedChannel = getVoiceBroadcast('chan_stage_01');
      expect(stoppedChannel?.isLive).toBe(false);

      // Subsequent actions on ended broadcast fail
      expect(() => {
        joinBroadcast('chan_stage_01', 'user_late_joiner');
      }).toThrowError(/Active voice broadcast not found/);

      expect(() => {
        leaveBroadcast('chan_stage_01', 'user_late_joiner');
      }).toThrowError(/Active voice broadcast not found/);
    });

    it('returns null or false for non-existent channel lookups and stop attempts', () => {
      expect(getVoiceBroadcast('non_existent')).toBeNull();
      expect(stopVoiceBroadcast('non_existent', 'user_any')).toBe(false);
    });
  });

  describe('Service Object Export Verification', () => {
    it('exposes all methods on StickerBroadcastService namespace', () => {
      expect(typeof StickerBroadcastService.createStickerPack).toBe('function');
      expect(typeof StickerBroadcastService.addStickerToPack).toBe('function');
      expect(typeof StickerBroadcastService.getStickerPack).toBe('function');
      expect(typeof StickerBroadcastService.listStickerPacks).toBe('function');
      expect(typeof StickerBroadcastService.parseMessageStickers).toBe('function');
      expect(typeof StickerBroadcastService.startVoiceBroadcast).toBe('function');
      expect(typeof StickerBroadcastService.joinBroadcast).toBe('function');
      expect(typeof StickerBroadcastService.leaveBroadcast).toBe('function');
      expect(typeof StickerBroadcastService.stopVoiceBroadcast).toBe('function');
      expect(typeof StickerBroadcastService.clearStickersAndBroadcastsForTesting).toBe('function');
    });
  });
});
