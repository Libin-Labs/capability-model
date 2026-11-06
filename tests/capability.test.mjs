import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityModel } from '../dist/esm/index.js';

const descriptor = (overrides = {}) => ({
  id: 'root',
  subject: 'alice',
  actions: ['read', 'write'],
  resources: ['doc:1', 'doc:2'],
  ...overrides,
});

test('grants immutable, scoped descriptors and evaluates exact subject/action/resource', () => {
  const model = createCapabilityModel({ now: () => 10 });
  const issued = model.grant(descriptor());
  assert.equal(Object.isFrozen(issued), true);
  assert.equal(Object.isFrozen(issued.actions), true);
  assert.equal(model.allows('root', 'alice', 'read', 'doc:1'), true);
  assert.equal(model.allows('root', 'bob', 'read', 'doc:1'), false);
  assert.equal(model.allows('root', 'alice', 'delete', 'doc:1'), false);
  assert.equal(model.allows('root', 'alice', 'read', 'doc:3'), false);
});

test('delegates only subsets with decreasing depth and bounded expiry', () => {
  const model = createCapabilityModel({ now: () => 10, maxDelegationDepth: 3 });
  model.grant(descriptor({ expiresAt: 100, delegationDepth: 2 }));
  const child = model.delegate('root', {
    id: 'child',
    subject: 'bob',
    actions: ['read'],
    resources: ['doc:1'],
    expiresAt: 80,
  });
  assert.equal(child.delegationDepth, 1);
  assert.equal(model.allows('child', 'bob', 'read', 'doc:1'), true);
  const grandchild = model.delegate('child', {
    id: 'grandchild',
    subject: 'carol',
    actions: ['read'],
    resources: ['doc:1'],
    expiresAt: 50,
  });
  assert.equal(grandchild.delegationDepth, 0);
  assert.throws(
    () =>
      model.delegate('grandchild', {
        id: 'last',
        subject: 'd',
        actions: ['read'],
        resources: ['doc:1'],
      }),
    /exhausted/,
  );
});

test('rejects delegated scope expansion or excessive expiration', () => {
  const model = createCapabilityModel({ now: () => 1 });
  model.grant(descriptor({ expiresAt: 100, delegationDepth: 1 }));
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'bad-action',
        subject: 'bob',
        actions: ['admin'],
        resources: ['doc:1'],
      }),
    /subset/,
  );
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'bad-resource',
        subject: 'bob',
        actions: ['read'],
        resources: ['other'],
      }),
    /subset/,
  );
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'bad-expiry',
        subject: 'bob',
        actions: ['read'],
        resources: ['doc:1'],
        expiresAt: 101,
      }),
    /expiration/,
  );
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'missing-expiry',
        subject: 'bob',
        actions: ['read'],
        resources: ['doc:1'],
      }),
    /expiration/,
  );
});

test('prevents delegation of expired and unknown parents', () => {
  let time = 10;
  const model = createCapabilityModel({ now: () => time });
  model.grant(descriptor({ expiresAt: 10, delegationDepth: 1 }));
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'child',
        subject: 'bob',
        actions: ['read'],
        resources: ['doc:1'],
      }),
    /Expired/,
  );
  assert.throws(
    () =>
      model.delegate('unknown', {
        id: 'child',
        subject: 'bob',
        actions: ['read'],
        resources: ['doc:1'],
      }),
    /Unknown parent/,
  );
  time = 11;
  assert.equal(model.allows('root', 'alice', 'read', 'doc:1'), false);
});

test('fails closed when the injected clock is invalid during delegation', () => {
  const model = createCapabilityModel({ now: () => Number.NaN });
  model.grant(descriptor({ expiresAt: 100, delegationDepth: 1 }));
  assert.throws(
    () =>
      model.delegate('root', {
        id: 'child',
        subject: 'bob',
        actions: ['read'],
        resources: ['doc:1'],
      }),
    /finite time/,
  );
});

test('validates duplicates, malformed scopes, depth, time, and capacity', () => {
  const model = createCapabilityModel({ maxCapabilities: 1, maxDelegationDepth: 1, now: () => 0 });
  assert.throws(() => model.grant(descriptor({ actions: [] })), /1 to 256/);
  assert.throws(() => model.grant(descriptor({ actions: ['read', 'read'] })), /duplicate/);
  assert.throws(() => model.grant(descriptor({ expiresAt: Number.NaN })), /finite/);
  model.grant(descriptor({ delegationDepth: 1 }));
  assert.throws(() => model.grant(descriptor({ id: 'root2' })), /capacity/);
  assert.throws(
    () => model.grant(descriptor({ id: 'root', delegationDepth: 2 })),
    /delegationDepth/,
  );
});

test('requires exact evaluation subject and returns false for missing capability', () => {
  const model = createCapabilityModel({ now: () => 0 });
  model.grant(descriptor());
  assert.equal(model.allows('missing', 'alice', 'read', 'doc:1'), false);
  assert.throws(() => model.allows('root', '', 'read', 'doc:1'), /Subject/);
  assert.throws(() => model.allows('root', 'alice', 'read', 'doc:1', Number.NaN), /finite/);
});

test('exposes an immutable snapshot of issued descriptors', () => {
  const model = createCapabilityModel();
  const root = model.grant(descriptor());
  const list = model.list();
  assert.equal(model.get('root'), root);
  assert.equal(Object.isFrozen(list), true);
  assert.throws(() => list.push(root), TypeError);
});
