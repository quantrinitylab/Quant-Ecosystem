import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';
const BACKEND_URL = 'http://127.0.0.1:3010';
const REFRESH_COOKIE = 'quantmail_refresh';
const LEGACY_KEYS = [
  'quant_auth_tokens',
  'quant_access_token',
  'quant_refresh_token',
  'token',
  'refreshToken',
] as const;

interface BackendState {
  loginCalls: number;
  refreshCalls: number;
  profileCalls: number;
  logoutCalls: number;
  loginEmails: Array<string | null>;
  loginOrigins: Array<string | null>;
  refreshOrigins: Array<string | null>;
  logoutOrigins: Array<string | null>;
  refreshCookieHeaders: string[];
  logoutCookieHeaders: string[];
  profileAuthorization: Array<string | null>;
}

async function backendState(request: APIRequestContext): Promise<BackendState> {
  const response = await request.get(`${BACKEND_URL}/__e2e/state`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<BackendState>;
}

async function storageSnapshot(page: Page) {
  return page.evaluate((keys) => {
    const read = (storage: Storage) =>
      Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]));
    const allValues = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? ''));
    return {
      local: read(window.localStorage),
      session: read(window.sessionStorage),
      allValues: [
        ...allValues(window.localStorage),
        ...allValues(window.sessionStorage),
      ],
    };
  }, [...LEGACY_KEYS]);
}

function expectNoBrowserTokens(snapshot: Awaited<ReturnType<typeof storageSnapshot>>) {
  expect(Object.values(snapshot.local).every((value) => value === null)).toBeTruthy();
  expect(Object.values(snapshot.session).every((value) => value === null)).toBeTruthy();
  expect(JSON.stringify(snapshot.allValues)).not.toContain('access-');
  expect(JSON.stringify(snapshot.allValues)).not.toContain('refresh-');
}

async function installProductApiStubs(context: BrowserContext, unexpectedPaths: string[]) {
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/oauth/userinfo') {
      await route.continue();
      return;
    }
    if (pathname === '/api/emails') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
          metadata: { total: 0, page: 1, pageSize: 50 },
        }),
      });
      return;
    }
    if (pathname === '/api/labels') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
      return;
    }

    unexpectedPaths.push(pathname);
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'UNEXPECTED_E2E_API', message: pathname, statusCode: 404 },
      }),
    });
  });
}

test.describe('QuantMail HttpOnly browser session', () => {
  test('login, one retry, reload recovery, cookie isolation, and logout', async ({
    context,
    page,
    request,
  }) => {
    const reset = await request.post(`${BACKEND_URL}/__e2e/reset`);
    expect(reset.ok()).toBeTruthy();

    await context.addInitScript(
      ({ keys, marker }) => {
        if (window.localStorage.getItem(marker)) return;
        window.localStorage.setItem(marker, '1');
        for (const key of keys) {
          window.localStorage.setItem(key, `legacy-${key}`);
          window.sessionStorage.setItem(key, `legacy-${key}`);
        }
      },
      { keys: [...LEGACY_KEYS], marker: 'quant-e2e-legacy-seeded' },
    );

    const unexpectedApiPaths: string[] = [];
    await installProductApiStubs(context, unexpectedApiPaths);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to QuantMail' })).toBeVisible();
    await expect
      .poll(async () => (await backendState(request)).refreshCalls)
      .toBeGreaterThan(0);
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeEnabled();

    const initialState = await backendState(request);
    expectNoBrowserTokens(await storageSnapshot(page));

    await page.getByLabel('Address or handle').fill('user@quantmail.in');
    await page.getByLabel('Password').fill('not-a-real-password');
    await signIn.click();

    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.getByRole('heading', { name: 'Your signal.' })).toBeVisible();
    await expect.poll(async () => (await backendState(request)).profileCalls).toBe(2);

    const afterLogin = await backendState(request);
    expect(afterLogin.loginCalls).toBe(1);
    expect(afterLogin.loginEmails).toEqual(['user@quantmail.in']);
    expect(afterLogin.loginOrigins).toEqual([BASE_URL]);
    expect(afterLogin.refreshCalls - initialState.refreshCalls).toBe(1);
    expect(afterLogin.profileAuthorization).toEqual([
      'Bearer access-login',
      `Bearer access-refresh-${afterLogin.refreshCalls}`,
    ]);
    expect(afterLogin.refreshCookieHeaders.at(-1)).toContain(
      `${REFRESH_COOKIE}=refresh-login`,
    );
    expectNoBrowserTokens(await storageSnapshot(page));

    const beforeReload = await backendState(request);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your signal.' })).toBeVisible();
    await expect
      .poll(async () => (await backendState(request)).refreshCalls)
      .toBe(beforeReload.refreshCalls + 1);

    const afterReload = await backendState(request);
    expect(afterReload.profileCalls).toBe(beforeReload.profileCalls + 1);
    expect(afterReload.profileAuthorization.at(-1)).toBe(
      `Bearer access-refresh-${afterReload.refreshCalls}`,
    );
    expectNoBrowserTokens(await storageSnapshot(page));

    const cookies = await context.cookies(`${BASE_URL}/auth/refresh`);
    const refreshCookie = cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
    expect(refreshCookie).toMatchObject({
      httpOnly: true,
      path: '/auth',
      sameSite: 'Strict',
      secure: false,
    });

    let probeCookieHeader: string | null = null;
    const probe = await context.newPage();
    await probe.route('**/auth/cookie-probe', async (route) => {
      probeCookieHeader = await route.request().headerValue('cookie');
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>cookie probe</title>',
      });
    });
    await probe.goto('/auth/cookie-probe');
    expect(probeCookieHeader).toContain(`${REFRESH_COOKIE}=refresh-`);
    expect(await probe.evaluate(() => document.cookie)).not.toContain(REFRESH_COOKIE);
    await probe.close();

    await page.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to QuantMail' })).toBeVisible();

    const afterLogout = await backendState(request);
    expect(afterLogout.logoutCalls).toBe(1);
    expect(afterLogout.logoutOrigins).toEqual([BASE_URL]);
    expect(afterLogout.logoutCookieHeaders.at(-1)).toContain(`${REFRESH_COOKIE}=refresh-`);
    expect(
      (await context.cookies(`${BASE_URL}/auth/refresh`)).find(
        (cookie) => cookie.name === REFRESH_COOKIE,
      ),
    ).toBeUndefined();
    expectNoBrowserTokens(await storageSnapshot(page));
    expect(unexpectedApiPaths).toEqual([]);
  });
});
