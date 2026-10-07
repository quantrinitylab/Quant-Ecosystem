/*
 * QuantChat embedded-game SDK (client side).
 * ---------------------------------------------------------------------------
 * Tiny zero-dependency helper that lets a sandboxed mini-game speak the
 * `quant-game` postMessage protocol expected by the host (see
 * apps/quantchat/src/lib/games-sdk.ts and useGameSdk.ts).
 *
 * Outbound (game -> host):
 *   { source: 'quant-game', type: 'ready',     gameId }
 *   { source: 'quant-game', type: 'game_over', payload: { gameId, sessionId, scores } }
 *   { source: 'quant-game', type: 'error',     gameId, message }
 *
 * Inbound (host -> game), optional:
 *   { source: 'quant-host', type: 'init', sessionId, context, participantIds }
 *   { source: 'quant-host', type: 'end' }
 *
 * The host does not currently relay per-move messages, so games are
 * self-sufficient (vs-AI or local pass-and-play) and report final scores.
 */
(function (global) {
  'use strict';

  function post(message) {
    try {
      // Host validates `message.source`, so a wildcard target origin is safe.
      (global.parent || global).postMessage(message, '*');
    } catch (err) {
      /* swallow — host iframe may be detached */
    }
  }

  function makeSessionId(gameId) {
    return (
      'gs_' + gameId + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    );
  }

  var initListeners = [];
  var endListeners = [];
  var sessionId = null;
  var participantIds = [];

  global.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.source !== 'quant-host') return;
    if (data.type === 'init') {
      sessionId = data.sessionId || sessionId;
      participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
      initListeners.forEach(function (cb) {
        try {
          cb({ sessionId: sessionId, context: data.context, participantIds: participantIds });
        } catch (e) {}
      });
    } else if (data.type === 'end') {
      endListeners.forEach(function (cb) {
        try {
          cb();
        } catch (e) {}
      });
    }
  });

  var QuantGame = {
    /** Announce the game finished loading and is interactive. */
    ready: function (gameId) {
      this.gameId = gameId;
      if (!sessionId) sessionId = makeSessionId(gameId);
      post({ source: 'quant-game', type: 'ready', gameId: gameId });
    },
    /** Register a callback for the optional host `init` handshake. */
    onInit: function (cb) {
      if (typeof cb === 'function') initListeners.push(cb);
    },
    /** Register a callback for the host `end`/quit signal. */
    onEnd: function (cb) {
      if (typeof cb === 'function') endListeners.push(cb);
    },
    /**
     * Report final scores. `scores` is an array of
     * { userId, displayName, score }. A sessionId is attached automatically.
     */
    gameOver: function (gameId, scores) {
      post({
        source: 'quant-game',
        type: 'game_over',
        payload: {
          gameId: gameId,
          sessionId: sessionId || makeSessionId(gameId),
          scores: scores || [],
        },
      });
    },
    /** Report a fatal in-game error to the host. */
    error: function (gameId, message) {
      post({ source: 'quant-game', type: 'error', gameId: gameId, message: String(message) });
    },
    /** The local player's id, if the host sent one via init. */
    localUserId: function () {
      return participantIds[0] || 'local';
    },
  };

  global.QuantGame = QuantGame;
})(typeof window !== 'undefined' ? window : this);
