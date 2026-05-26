import { describe, it, expect, beforeEach } from 'vitest';
import { SFUService } from '../services/sfu.service';
import type { DtlsParameters, RtpParameters, RtpCapabilities } from '../services/sfu.service';

describe('SFUService', () => {
  let service: SFUService;

  const mockDtlsParameters: DtlsParameters = {
    fingerprints: [{ algorithm: 'sha-256', value: 'AA:BB:CC:DD' }],
    role: 'client',
  };

  const mockRtpParameters: RtpParameters = {
    codecs: [
      {
        mimeType: 'audio/opus',
        payloadType: 111,
        clockRate: 48000,
        channels: 2,
      },
    ],
    headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level', id: 1 }],
    encodings: [{ ssrc: 12345 }],
  };

  const mockRtpCapabilities: RtpCapabilities = {
    codecs: [
      {
        mimeType: 'audio/opus',
        kind: 'audio',
        clockRate: 48000,
        channels: 2,
      },
    ],
    headerExtensions: [
      {
        uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
        kind: 'audio',
        preferredId: 1,
      },
    ],
  };

  beforeEach(() => {
    service = new SFUService();
  });

  describe('createTransport', () => {
    it('returns TransportInfo with id, iceParameters, iceCandidates, dtlsParameters for send direction', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');

      expect(transport.id).toBeDefined();
      expect(transport.iceParameters.usernameFragment).toBeDefined();
      expect(transport.iceParameters.password).toBeDefined();
      expect(transport.iceCandidates).toHaveLength(1);
      expect(transport.iceCandidates[0]!.type).toBe('host');
      expect(transport.iceCandidates[0]!.protocol).toBe('udp');
      expect(transport.dtlsParameters.fingerprints).toHaveLength(1);
      expect(transport.dtlsParameters.role).toBe('auto');
    });

    it('returns TransportInfo for recv direction', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'recv');

      expect(transport.id).toBeDefined();
      expect(transport.iceParameters.usernameFragment).toBeDefined();
      expect(transport.iceParameters.password).toBeDefined();
      expect(transport.iceCandidates.length).toBeGreaterThan(0);
      expect(transport.dtlsParameters.fingerprints.length).toBeGreaterThan(0);
    });

    it('generates unique transport ids', () => {
      const t1 = service.createTransport('room-1', 'participant-1', 'send');
      const t2 = service.createTransport('room-1', 'participant-1', 'recv');

      expect(t1.id).not.toBe(t2.id);
    });

    it('includes valid ice candidate fields', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');
      const candidate = transport.iceCandidates[0]!;

      expect(candidate.foundation).toBe('udpcandidate');
      expect(candidate.priority).toBeGreaterThan(0);
      expect(candidate.ip).toBe('127.0.0.1');
      expect(candidate.port).toBeGreaterThanOrEqual(40000);
      expect(candidate.port).toBeLessThan(50000);
    });
  });

  describe('connectTransport', () => {
    it('succeeds with a valid transportId', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');

      expect(() => service.connectTransport(transport.id, mockDtlsParameters)).not.toThrow();
    });

    it('throws TRANSPORT_NOT_FOUND for unknown transport', () => {
      expect(() => service.connectTransport('unknown-id', mockDtlsParameters)).toThrow(
        'Transport not found',
      );
    });

    it('throws TRANSPORT_ALREADY_CONNECTED if already connected', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(transport.id, mockDtlsParameters);

      expect(() => service.connectTransport(transport.id, mockDtlsParameters)).toThrow(
        'Transport already connected',
      );
    });
  });

  describe('produce', () => {
    it('creates producer with kind and rtpParameters on connected send transport', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(transport.id, mockDtlsParameters);

      const producer = service.produce(transport.id, 'audio', mockRtpParameters);

      expect(producer.id).toBeDefined();
      expect(producer.kind).toBe('audio');
      expect(producer.rtpParameters).toEqual(mockRtpParameters);
    });

    it('throws TRANSPORT_NOT_FOUND for invalid transport', () => {
      expect(() => service.produce('invalid-transport', 'audio', mockRtpParameters)).toThrow(
        'Transport not found',
      );
    });

    it('throws TRANSPORT_NOT_CONNECTED if transport is not connected', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');

      expect(() => service.produce(transport.id, 'audio', mockRtpParameters)).toThrow(
        'Transport not connected',
      );
    });

    it('throws INVALID_TRANSPORT_DIRECTION for recv transport', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'recv');
      service.connectTransport(transport.id, mockDtlsParameters);

      expect(() => service.produce(transport.id, 'audio', mockRtpParameters)).toThrow(
        'Cannot produce on recv transport',
      );
    });

    it('can produce video track', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(transport.id, mockDtlsParameters);

      const videoRtp: RtpParameters = {
        codecs: [{ mimeType: 'video/VP8', payloadType: 96, clockRate: 90000 }],
        headerExtensions: [],
        encodings: [{ ssrc: 99999 }],
      };

      const producer = service.produce(transport.id, 'video', videoRtp);

      expect(producer.kind).toBe('video');
    });
  });

  describe('consume', () => {
    it('creates consumer referencing a producer', () => {
      const sendTransport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(sendTransport.id, mockDtlsParameters);
      const producer = service.produce(sendTransport.id, 'audio', mockRtpParameters);

      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);

      const consumer = service.consume(recvTransport.id, producer.id, mockRtpCapabilities);

      expect(consumer.id).toBeDefined();
      expect(consumer.producerId).toBe(producer.id);
      expect(consumer.kind).toBe('audio');
      expect(consumer.rtpParameters).toEqual(mockRtpParameters);
    });

    it('throws PRODUCER_NOT_FOUND for unknown producer', () => {
      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);

      expect(() =>
        service.consume(recvTransport.id, 'unknown-producer', mockRtpCapabilities),
      ).toThrow('Producer not found');
    });

    it('throws TRANSPORT_NOT_FOUND for unknown transport', () => {
      expect(() =>
        service.consume('unknown-transport', 'some-producer', mockRtpCapabilities),
      ).toThrow('Transport not found');
    });

    it('throws INVALID_TRANSPORT_DIRECTION for send transport', () => {
      const sendTransport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(sendTransport.id, mockDtlsParameters);
      const producer = service.produce(sendTransport.id, 'audio', mockRtpParameters);

      expect(() => service.consume(sendTransport.id, producer.id, mockRtpCapabilities)).toThrow(
        'Cannot consume on send transport',
      );
    });
  });

  describe('closeProducer', () => {
    it('removes producer from registry', () => {
      const transport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(transport.id, mockDtlsParameters);
      const producer = service.produce(transport.id, 'audio', mockRtpParameters);

      service.closeProducer(producer.id);

      // Attempting to consume the closed producer should fail
      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);
      expect(() => service.consume(recvTransport.id, producer.id, mockRtpCapabilities)).toThrow(
        'Producer not found',
      );
    });

    it('throws PRODUCER_NOT_FOUND for unknown producer', () => {
      expect(() => service.closeProducer('unknown-producer')).toThrow('Producer not found');
    });

    it('removes associated consumers when producer is closed', () => {
      const sendTransport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(sendTransport.id, mockDtlsParameters);
      const producer = service.produce(sendTransport.id, 'audio', mockRtpParameters);

      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);
      const consumer = service.consume(recvTransport.id, producer.id, mockRtpCapabilities);

      service.closeProducer(producer.id);

      // Consumer should also be gone
      expect(() => service.closeConsumer(consumer.id)).toThrow('Consumer not found');
    });
  });

  describe('closeConsumer', () => {
    it('removes consumer from registry', () => {
      const sendTransport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(sendTransport.id, mockDtlsParameters);
      const producer = service.produce(sendTransport.id, 'audio', mockRtpParameters);

      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);
      const consumer = service.consume(recvTransport.id, producer.id, mockRtpCapabilities);

      service.closeConsumer(consumer.id);

      // Should throw on double close
      expect(() => service.closeConsumer(consumer.id)).toThrow('Consumer not found');
    });

    it('throws CONSUMER_NOT_FOUND for unknown consumer', () => {
      expect(() => service.closeConsumer('unknown-consumer')).toThrow('Consumer not found');
    });

    it('does not affect the producer when consumer is closed', () => {
      const sendTransport = service.createTransport('room-1', 'participant-1', 'send');
      service.connectTransport(sendTransport.id, mockDtlsParameters);
      const producer = service.produce(sendTransport.id, 'audio', mockRtpParameters);

      const recvTransport = service.createTransport('room-1', 'participant-2', 'recv');
      service.connectTransport(recvTransport.id, mockDtlsParameters);
      const consumer = service.consume(recvTransport.id, producer.id, mockRtpCapabilities);

      service.closeConsumer(consumer.id);

      // Producer should still be valid - can create another consumer
      const recvTransport2 = service.createTransport('room-1', 'participant-3', 'recv');
      service.connectTransport(recvTransport2.id, mockDtlsParameters);
      const consumer2 = service.consume(recvTransport2.id, producer.id, mockRtpCapabilities);
      expect(consumer2.producerId).toBe(producer.id);
    });
  });
});
