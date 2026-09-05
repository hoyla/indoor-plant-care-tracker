import assert from 'node:assert/strict';
import test from 'node:test';

import { config, middleware } from '../middleware.js';

const env = {
  PLANT_GUIDE_PASSWORD: 'a long test password',
  PLANT_GUIDE_SESSION_SECRET: 'test-session-secret-with-plenty-of-length',
};

function context(request, overrides = {}) {
  return {
    request,
    env,
    next: () => new Response('private guide', { status: 200 }),
    ...overrides,
  };
}

test('matches every route so static assets are protected', () => {
  assert.deepEqual(config.matcher, ['/:path*']);
});

test('fails closed when EdgeOne secrets are absent', async () => {
  const response = await middleware(context(new Request('https://plants.example/'), { env: {} }));
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not configured/i);
});

test('fails closed when configured secrets are too short', async () => {
  const response = await middleware(context(new Request('https://plants.example/'), {
    env: {
      PLANT_GUIDE_PASSWORD: 'short',
      PLANT_GUIDE_SESSION_SECRET: 'also-short',
    },
  }));
  assert.equal(response.status, 503);
});

test('redirects an unauthenticated request to login with its return path', async () => {
  const response = await middleware(context(new Request('https://plants.example/images/example.jpg?size=large')));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login?next=%2Fimages%2Fexample.jpg%3Fsize%3Dlarge');
});

test('serves a self-contained login page without caching', async () => {
  const response = await middleware(context(new Request('https://plants.example/login?next=%2Fdata%2Fplants.json')));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(body, /Private plant guide/);
  assert.match(body, /value="\/data\/plants.json"/);
});

test('rejects an incorrect password', async () => {
  const form = new FormData();
  form.set('password', 'wrong');
  form.set('next', '/');
  const response = await middleware(context(new Request('https://plants.example/login', { method: 'POST', body: form })));
  assert.equal(response.status, 401);
  assert.match(await response.text(), /did not match/i);
});

test('issues a secure cookie and accepts it on later requests', async () => {
  const form = new FormData();
  form.set('password', env.PLANT_GUIDE_PASSWORD);
  form.set('next', '/data/plants.json');
  const loginResponse = await middleware(context(new Request('https://plants.example/login', { method: 'POST', body: form })));
  const setCookie = loginResponse.headers.get('set-cookie');

  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get('location'), '/data/plants.json');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);

  const cookie = setCookie.split(';', 1)[0];
  const protectedResponse = await middleware(context(new Request('https://plants.example/data/plants.json', {
    headers: { cookie },
  })));
  assert.equal(protectedResponse.status, 200);
  assert.equal(await protectedResponse.text(), 'private guide');
});

test('rejects a modified session cookie', async () => {
  const response = await middleware(context(new Request('https://plants.example/', {
    headers: { cookie: 'plant_guide_session=v1.9999999999.invalid' },
  })));
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location'), /^\/login/);
});

test('logout clears the session cookie', async () => {
  const response = await middleware(context(new Request('https://plants.example/logout')));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login');
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('does not permit an external post-login redirect', async () => {
  const form = new FormData();
  form.set('password', env.PLANT_GUIDE_PASSWORD);
  form.set('next', '//attacker.example');
  const response = await middleware(context(new Request('https://plants.example/login', { method: 'POST', body: form })));
  assert.equal(response.headers.get('location'), '/');
});
