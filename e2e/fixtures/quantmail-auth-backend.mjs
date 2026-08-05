import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.QUANTMAIL_AUTH_E2E_PORT ?? '3010');
const cookieAttributes = 'Path=/auth; HttpOnly; SameSite=Strict; Max-Age=2592000';
const user = {
  id: 'user-1',
  email: 'user@quantmail.in',
  username: 'user',
  displayName: 'User',
  role: 'USER',
};

const freshState = () => ({
  loginCalls: 0,
  refreshCalls: 0,
  profileCalls: 0,
  logoutCalls: 0,
  loginEmails: [],
  loginOrigins: [],
  refreshOrigins: [],
  logoutOrigins: [],
  refreshCookieHeaders: [],
  logoutCookieHeaders: [],
  profileAuthorization: [],
});

let state = freshState();

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
  const origin = request.headers.origin ?? null;
  const cookie = request.headers.cookie ?? '';

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/__e2e/reset') {
    state = freshState();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/__e2e/state') {
    sendJson(response, 200, state);
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/auth/login') {
    state.loginCalls += 1;
    const body = await readJson(request);
    state.loginEmails.push(typeof body.email === 'string' ? body.email : null);
    state.loginOrigins.push(origin);
    sendJson(
      response,
      200,
      { success: true, data: { accessToken: 'access-login', expiresIn: 900 } },
      { 'set-cookie': `quantmail_refresh=refresh-login; ${cookieAttributes}` },
    );
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/auth/refresh') {
    state.refreshCalls += 1;
    state.refreshOrigins.push(origin);
    state.refreshCookieHeaders.push(cookie);
    if (!cookie.includes('quantmail_refresh=')) {
      sendJson(response, 401, {
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token is required.',
          statusCode: 401,
        },
      });
      return;
    }

    const sequence = state.refreshCalls;
    sendJson(
      response,
      200,
      { success: true, data: { accessToken: `access-refresh-${sequence}`, expiresIn: 900 } },
      { 'set-cookie': `quantmail_refresh=refresh-${sequence}; ${cookieAttributes}` },
    );
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/oauth/userinfo') {
    state.profileCalls += 1;
    state.profileAuthorization.push(request.headers.authorization ?? null);
    if (state.profileCalls === 1) {
      sendJson(response, 401, {
        success: false,
        error: {
          code: 'ACCESS_TOKEN_EXPIRED',
          message: 'Access token expired.',
          statusCode: 401,
        },
      });
      return;
    }
    sendJson(response, 200, { success: true, data: user });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/auth/logout') {
    state.logoutCalls += 1;
    state.logoutOrigins.push(origin);
    state.logoutCookieHeaders.push(cookie);
    sendJson(
      response,
      200,
      { success: true, data: { message: 'Logged out.' } },
      {
        'set-cookie':
          'quantmail_refresh=; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=0',
      },
    );
    return;
  }

  sendJson(response, 404, {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Not found.', statusCode: 404 },
  });
});

server.listen(port, host, () => {
  console.log(`QuantMail auth E2E backend listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
