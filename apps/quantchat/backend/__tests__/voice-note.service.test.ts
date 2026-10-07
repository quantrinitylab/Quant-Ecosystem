import { describe, it, expect, vi } from 'vitest';
import {
  VoiceNoteService,
  NullTranscriber,
  NullSynth,
  type TranscriberPort,
  type VoiceSynthPort,
  type ReplyGeneratorPort,
  type VoiceMessageSink,
  type VoiceModeratorPort,
} from '../services/voice-note.service';

const goodTranscriber: TranscriberPort = {
  transcribe: async () => ({ ok: true, text: 'hello there' }),
};
const goodSynth: VoiceSynthPort = {
  synthesize: async () => ({ ok: true, audioUrl: 'https://cdn/reply.mp3' }),
};
const echoReply: ReplyGeneratorPort = { generate: async (t) => `reply to: ${t}` };

describe('VoiceNoteService', () => {
  it('transcribe fails closed with the default NullTranscriber', async () => {
    const svc = new VoiceNoteService();
    await expect(svc.transcribe('https://cdn/note.mp3')).rejects.toMatchObject({
      statusCode: 503,
      code: 'TRANSCRIBER_NOT_CONFIGURED',
    });
  });

  it('rejects an empty audio url', async () => {
    const svc = new VoiceNoteService({ transcriber: goodTranscriber });
    await expect(svc.transcribe('  ')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('transcribes with a configured provider', async () => {
    const svc = new VoiceNoteService({ transcriber: goodTranscriber });
    expect(await svc.transcribe('https://cdn/note.mp3')).toBe('hello there');
  });

  it('autoReply fails closed when the reply generator is not configured', async () => {
    const svc = new VoiceNoteService({ transcriber: goodTranscriber, synth: goodSynth });
    await expect(
      svc.autoReply({ conversationId: 'c1', senderId: 'ai', audioUrl: 'https://cdn/n.mp3' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'REPLY_GENERATOR_NOT_CONFIGURED' });
  });

  it('autoReply fails closed when the sink is not configured', async () => {
    const svc = new VoiceNoteService({
      transcriber: goodTranscriber,
      synth: goodSynth,
      replyGenerator: echoReply,
    });
    await expect(
      svc.autoReply({ conversationId: 'c1', senderId: 'ai', audioUrl: 'https://cdn/n.mp3' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'VOICE_SINK_NOT_CONFIGURED' });
  });

  it('runs the full transcribe -> reply -> synth -> send pipeline', async () => {
    const sink: VoiceMessageSink & { sent: unknown[] } = {
      sent: [],
      sendAudio: async (input) => {
        (sink.sent as unknown[]).push(input);
        return { messageId: 'msg-1' };
      },
    };
    const svc = new VoiceNoteService({
      transcriber: goodTranscriber,
      synth: goodSynth,
      replyGenerator: echoReply,
      sink,
    });
    const res = await svc.autoReply({
      conversationId: 'c1',
      senderId: 'ai',
      audioUrl: 'https://cdn/n.mp3',
    });
    expect(res.transcript).toBe('hello there');
    expect(res.replyText).toBe('reply to: hello there');
    expect(res.audioUrl).toBe('https://cdn/reply.mp3');
    expect(res.messageId).toBe('msg-1');
    expect(sink.sent).toHaveLength(1);
  });

  it('blocks the send when moderation rejects the reply (no unmoderated audio)', async () => {
    const send = vi.fn(async () => ({ messageId: 'msg-1' }));
    const moderator: VoiceModeratorPort = {
      check: async () => ({ allowed: false, reason: 'policy' }),
    };
    const svc = new VoiceNoteService({
      transcriber: goodTranscriber,
      synth: goodSynth,
      replyGenerator: echoReply,
      moderator,
      sink: { sendAudio: send },
    });
    await expect(
      svc.autoReply({ conversationId: 'c1', senderId: 'ai', audioUrl: 'https://cdn/n.mp3' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'MODERATION_REJECTED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('autoReply fails closed when synthesis is not configured', async () => {
    const svc = new VoiceNoteService({
      transcriber: goodTranscriber,
      synth: new NullSynth(),
      replyGenerator: echoReply,
      sink: { sendAudio: async () => ({ messageId: 'm' }) },
    });
    await expect(
      svc.autoReply({ conversationId: 'c1', senderId: 'ai', audioUrl: 'https://cdn/n.mp3' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'SYNTH_NOT_CONFIGURED' });
  });

  it('NullTranscriber / NullSynth report fail-closed results', async () => {
    expect(await new NullTranscriber().transcribe()).toMatchObject({ ok: false });
    expect(await new NullSynth().synthesize()).toMatchObject({ ok: false });
  });
});
