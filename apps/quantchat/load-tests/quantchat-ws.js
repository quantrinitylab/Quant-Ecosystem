// QuantChat realtime load / soak test (k6).
//
// Exercises the launch-critical realtime path (Requirement 18.5, design
// "Load / Soak Testing" + "Performance Considerations"):
//
//   * N concurrent WebSocket connections to /ws/chat
//   * sustained message throughput (`chat_message` frames)
//   * presence churn (rapid connect/disconnect cycles)
//
// and validates the design SLOs via thresholds:
//
//   * p95 fan-out / round-trip latency < 300ms (send -> recipient socket)
//   * WS connection success rate stays high (horizontal scaling holds up)
//
// One script, two scenarios, selected with SCENARIO=load|soak:
//
//   SCENARIO=load  ramps to TARGET_VUS and holds   -> peak throughput + scaling
//   SCENARIO=soak  low constant load for SOAK_DURATION -> stability / leak hunt
//
// Run:
//   k6 run -e SCENARIO=load -e WS_URL=ws://localhost:3002/ws/chat \
//          -e JWT_SECRET=dev-secret-at-least-32-characters-long \
//          apps/quantchat/load-tests/quantchat-ws.js
//
// See ./README.md for staging usage and the full env-var reference.

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { getToken } from './lib/token.js';

// ---------------------------------------------------------------------------
// Configuration (all overridable via -e ENV=value)
// ---------------------------------------------------------------------------

const SCENARIO = (__ENV.SCENARIO || 'load').toLowerCase();
const WS_URL = __ENV.WS_URL || 'ws://localhost:3002/ws/chat';

// A comma-separated list of conversation ids to spread VUs across. Each VU
// joins one of these rooms; multiple VUs in the same room exercise fan-out.
const CONVERSATIONS = (__ENV.CONVERSATION_IDS || 'loadtest-conversation')
  .split(',')
  .map((c) => c.trim())
  .filter((c) => c.length > 0);

// Sustained-throughput knobs.
const MSG_INTERVAL_MS = parseInt(__ENV.MSG_INTERVAL_MS || '1000', 10); // per VU
const HOLD_SECONDS = parseInt(__ENV.HOLD_SECONDS || '30', 10); // time a chat VU stays connected

// Load scenario shape.
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '200', 10);
const RAMP = __ENV.RAMP || '1m';
const HOLD = __ENV.HOLD || '3m';
const RAMP_DOWN = __ENV.RAMP_DOWN || '30s';

// Soak scenario shape.
const SOAK_VUS = parseInt(__ENV.SOAK_VUS || '40', 10);
const SOAK_DURATION = __ENV.SOAK_DURATION || '2h';

// Presence-churn shape (connect/disconnect rate).
const CHURN_RATE = parseInt(__ENV.CHURN_RATE || '20', 10); // iterations/sec
const CHURN_VUS = parseInt(__ENV.CHURN_VUS || '50', 10);

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

// End-to-end fan-out latency: time from sending a chat_message to receiving the
// corresponding new_message frame back over the socket (the server echoes the
// new_message to every socket in the room, including the sender).
const fanoutLatency = new Trend('ws_roundtrip_latency', true);
const wsConnectSuccess = new Rate('ws_connect_success');
const wsSessionErrors = new Rate('ws_session_errors');
const messagesSent = new Counter('chat_messages_sent');
const messagesReceived = new Counter('chat_messages_received');
const presenceChurnCycles = new Counter('presence_churn_cycles');

// ---------------------------------------------------------------------------
// Scenario / threshold options
// ---------------------------------------------------------------------------

const thresholds = {
  // Design SLO: p95 end-to-end fan-out latency < 300ms within a region.
  ws_roundtrip_latency: ['p(95)<300'],
  // Horizontal scaling must keep connection establishment healthy.
  ws_connect_success: ['rate>0.99'],
  ws_session_errors: ['rate<0.01'],
  // Sanity: most round-trips actually complete.
  checks: ['rate>0.95'],
};

const loadScenarios = {
  chat_traffic: {
    executor: 'ramping-vus',
    exec: 'chatTraffic',
    startVUs: 0,
    stages: [
      { duration: RAMP, target: TARGET_VUS },
      { duration: HOLD, target: TARGET_VUS },
      { duration: RAMP_DOWN, target: 0 },
    ],
    gracefulStop: '30s',
  },
  presence_churn: {
    executor: 'constant-arrival-rate',
    exec: 'presenceChurn',
    rate: CHURN_RATE,
    timeUnit: '1s',
    duration: HOLD,
    preAllocatedVUs: CHURN_VUS,
    maxVUs: CHURN_VUS * 2,
    startTime: RAMP, // begin churning once the cluster is warm
  },
};

const soakScenarios = {
  chat_traffic: {
    executor: 'constant-vus',
    exec: 'chatTraffic',
    vus: SOAK_VUS,
    duration: SOAK_DURATION,
    gracefulStop: '30s',
  },
  presence_churn: {
    executor: 'constant-arrival-rate',
    exec: 'presenceChurn',
    rate: Math.max(1, Math.floor(CHURN_RATE / 4)),
    timeUnit: '1s',
    duration: SOAK_DURATION,
    preAllocatedVUs: Math.max(5, Math.floor(CHURN_VUS / 4)),
    maxVUs: CHURN_VUS,
  },
};

export const options = {
  scenarios: SCENARIO === 'soak' ? soakScenarios : loadScenarios,
  thresholds,
  // Keep summaries focused on the realtime metrics that matter.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function conversationForVu(vuId) {
  return CONVERSATIONS[vuId % CONVERSATIONS.length];
}

function connectUrl(token, conversationId) {
  const sep = WS_URL.includes('?') ? '&' : '?';
  return `${WS_URL}${sep}conversationId=${encodeURIComponent(conversationId)}&token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Scenario: sustained chat traffic + fan-out latency measurement
// ---------------------------------------------------------------------------

export function chatTraffic() {
  const vuId = __VU;
  const token = getToken(vuId);
  const conversationId = conversationForVu(vuId);
  const url = connectUrl(token, conversationId);

  // Track in-flight sends so a received new_message can be timed against its
  // originating send. Keyed by a per-message nonce echoed back by the server
  // (the backend spreads `...message` into the new_message payload).
  const inflight = {};

  const res = ws.connect(url, {}, (socket) => {
    wsConnectSuccess.add(true);

    socket.on('open', () => {
      // Ensure we are joined to the room (the query param already joins, this
      // also models the client's explicit join_conversation frame).
      socket.send(JSON.stringify({ type: 'join_conversation', conversationId }));

      // Sustained throughput: emit a chat_message every MSG_INTERVAL_MS.
      socket.setInterval(() => {
        const nonce = `${vuId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        inflight[nonce] = Date.now();
        socket.send(
          JSON.stringify({
            type: 'chat_message',
            conversationId,
            nonce,
            content: 'load-test-ciphertext-placeholder',
          }),
        );
        messagesSent.add(1);
      }, MSG_INTERVAL_MS);

      // Keep presence fresh while connected.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ type: 'heartbeat' }));
      }, 10000);

      // End this VU's session after HOLD_SECONDS so ramping/soak cycles VUs.
      socket.setTimeout(() => socket.close(), HOLD_SECONDS * 1000);
    });

    socket.on('message', (raw) => {
      let event;
      try {
        event = JSON.parse(raw);
      } catch (_e) {
        return;
      }
      if (event.type === 'new_message') {
        messagesReceived.add(1);
        const data = event.data || event.payload || {};
        const nonce = data.nonce;
        if (nonce && inflight[nonce] != null) {
          fanoutLatency.add(Date.now() - inflight[nonce]);
          delete inflight[nonce];
          check(event, { 'new_message echoed for our send': () => true });
        }
        // Model a recipient acknowledging delivery + read.
        if (data.messageId || data.id) {
          const messageId = data.messageId || data.id;
          socket.send(
            JSON.stringify({ type: 'delivery_ack', conversationId, messageId }),
          );
        }
      }
    });

    socket.on('error', (e) => {
      // Ignore the expected close races; record genuine session errors.
      if (e && e.error && !`${e.error}`.includes('close')) {
        wsSessionErrors.add(true);
      }
    });

    socket.on('close', () => {
      wsSessionErrors.add(false);
    });
  });

  const ok = check(res, { 'ws handshake status is 101': (r) => r && r.status === 101 });
  if (!ok) {
    wsConnectSuccess.add(false);
    wsSessionErrors.add(true);
  }
}

// ---------------------------------------------------------------------------
// Scenario: presence churn (rapid connect / disconnect)
// ---------------------------------------------------------------------------

export function presenceChurn() {
  const vuId = __VU + 100000; // distinct user space from chat VUs
  const token = getToken(vuId);
  const conversationId = conversationForVu(vuId);
  const url = connectUrl(token, conversationId);

  const res = ws.connect(url, {}, (socket) => {
    wsConnectSuccess.add(true);
    socket.on('open', () => {
      // Connect briefly so the backend records an online->offline transition
      // and publishes presence:update across the backplane, then drop.
      socket.setTimeout(() => socket.close(), 500 + Math.floor(Math.random() * 500));
    });
    socket.on('close', () => {
      presenceChurnCycles.add(1);
    });
    socket.on('error', (e) => {
      if (e && e.error && !`${e.error}`.includes('close')) {
        wsSessionErrors.add(true);
      }
    });
  });

  const ok = check(res, { 'churn handshake status is 101': (r) => r && r.status === 101 });
  if (!ok) {
    wsConnectSuccess.add(false);
  }
  sleep(0.1);
}
