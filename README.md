# @lp-labs/capability-model

Immutable, bounded scoped capability descriptors with delegation constrained to the parent's subject
scopes, lifetime, and remaining delegation depth. This package is a data model, not an authorization
server or an authentication mechanism.

## Install

```sh
npm install @lp-labs/capability-model
```

## Quick start

```js
import assert from 'node:assert/strict';
import { createCapabilityModel } from '@lp-labs/capability-model';

let now = 1_000;
const capabilities = createCapabilityModel({ now: () => now, maxDelegationDepth: 3 });
capabilities.grant({
  id: 'root',
  subject: 'user:alice',
  actions: ['read', 'write'],
  resources: ['document:1'],
  expiresAt: 10_000,
  delegationDepth: 1,
});
capabilities.delegate('root', {
  id: 'reader',
  subject: 'user:bob',
  actions: ['read'],
  resources: ['document:1'],
  expiresAt: 5_000,
});
assert.equal(capabilities.allows('reader', 'user:bob', 'read', 'document:1'), true);
assert.equal(capabilities.allows('reader', 'user:bob', 'write', 'document:1'), false);
now = 5_000;
assert.equal(capabilities.allows('reader', 'user:bob', 'read', 'document:1'), false);
```

## API and types

- `createCapabilityModel(options?): CapabilityModel` creates an in-memory issuer with optional
  `maxCapabilities`, `maxDelegationDepth`, and injected `now(): number` clock.
- `CapabilityModel.grant(input): CapabilityDescriptor` issues a root descriptor. Its
  `delegationDepth` defaults to zero.
- `CapabilityModel.delegate(parentId, input): CapabilityDescriptor` issues a child descriptor only
  when its requested actions/resources are subsets, its expiry does not outlive the parent, and the
  parent's remaining depth permits delegation.
- `CapabilityModel.get(id)` retrieves an issued immutable descriptor; `list()` returns an immutable
  snapshot.
- `CapabilityModel.allows(id, subject, action, resource, at?)` performs a pure scope-and-expiry
  predicate. Unknown IDs return `false`; an omitted time uses the configured clock or `Date.now()`.
- `CapabilityInput` defines root/delegated input. `CapabilityDescriptor` reports immutable exact
  subject, action/resource scopes, optional expiry, and remaining delegation depth.

## Limits and errors

Identifiers are case-sensitive, nonempty strings up to 256 characters; each action/resource scope
contains 1–256 unique values. Defaults are 10,000 descriptors and maximum delegation depth 8;
capacity accepts 1–1,000,000 and depth accepts 0–64. Invalid data throws `TypeError`; invalid bounds,
duplicate IDs, exhausted capacity, expired parents, and attempts to broaden scope or lifetime fail
explicitly with `RangeError` or `Error`. Expiration is exclusive: a descriptor is expired when
`evaluationTime >= expiresAt`.

## Security boundary and customization

Applications may inject a deterministic clock for tests or fixed-time evaluation. The model stores
descriptors only in process memory; it does not authenticate subjects, sign or encrypt descriptors,
persist revocation, prevent forged IDs outside the model, enforce a request, or communicate with a
policy server. Treat `allows` as a local scope predicate, not a complete authorization decision.
Applications remain responsible for identity, secure issuance and transport, revocation, persistence,
resource ownership checks, and enforcement at the operation boundary.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
