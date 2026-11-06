export interface CapabilityDescriptor {
  readonly id: string;
  readonly subject: string;
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly expiresAt?: number;
  readonly delegationDepth: number;
}
export interface CapabilityInput {
  readonly id: string;
  readonly subject: string;
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly expiresAt?: number;
  readonly delegationDepth?: number;
}
export interface CapabilityModel {
  grant(input: CapabilityInput): CapabilityDescriptor;
  delegate(parentId: string, input: CapabilityInput): CapabilityDescriptor;
  get(id: string): CapabilityDescriptor | undefined;
  list(): readonly CapabilityDescriptor[];
  allows(id: string, subject: string, action: string, resource: string, at?: number): boolean;
}

const label = (value: string, name: string): void => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256)
    throw new TypeError(`${name} must be a nonempty string up to 256 characters.`);
};
const scope = (values: readonly string[], name: string): readonly string[] => {
  if (!Array.isArray(values) || values.length === 0 || values.length > 256)
    throw new RangeError(`${name} must contain 1 to 256 values.`);
  const result = new Set<string>();
  for (const value of values) {
    label(value, name);
    if (result.has(value)) throw new TypeError(`${name} contains a duplicate value: ${value}`);
    result.add(value);
  }
  return Object.freeze([...result]);
};

export function createCapabilityModel(
  options: {
    readonly maxCapabilities?: number;
    readonly maxDelegationDepth?: number;
    readonly now?: () => number;
  } = {},
): CapabilityModel {
  if (!options || typeof options !== 'object') throw new TypeError('Options must be an object.');
  const maxCapabilities = options.maxCapabilities ?? 10_000;
  const maxDelegationDepth = options.maxDelegationDepth ?? 8;
  if (!Number.isSafeInteger(maxCapabilities) || maxCapabilities < 1 || maxCapabilities > 1_000_000)
    throw new RangeError('maxCapabilities must be an integer from 1 to 1000000.');
  if (
    !Number.isSafeInteger(maxDelegationDepth) ||
    maxDelegationDepth < 0 ||
    maxDelegationDepth > 64
  )
    throw new RangeError('maxDelegationDepth must be an integer from 0 to 64.');
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') throw new TypeError('now must be a function.');
  const capabilities = new Map<string, CapabilityDescriptor>();
  const issue = (input: CapabilityInput, depth: number): CapabilityDescriptor => {
    if (!input || typeof input !== 'object')
      throw new TypeError('Capability input must be an object.');
    label(input.id, 'Capability ID');
    label(input.subject, 'Subject');
    if (capabilities.has(input.id)) throw new TypeError(`Duplicate capability ID: ${input.id}`);
    if (capabilities.size >= maxCapabilities) throw new RangeError('Capability capacity exceeded.');
    if (input.expiresAt !== undefined && !Number.isFinite(input.expiresAt))
      throw new TypeError('expiresAt must be finite epoch milliseconds.');
    const descriptor = Object.freeze({
      id: input.id,
      subject: input.subject,
      actions: scope(input.actions, 'Actions'),
      resources: scope(input.resources, 'Resources'),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      delegationDepth: depth,
    });
    capabilities.set(input.id, descriptor);
    return descriptor;
  };
  return {
    grant(input) {
      const depth = input.delegationDepth ?? 0;
      if (!Number.isSafeInteger(depth) || depth < 0 || depth > maxDelegationDepth)
        throw new RangeError(`delegationDepth must be an integer from 0 to ${maxDelegationDepth}.`);
      return issue(input, depth);
    },
    delegate(parentId, input) {
      label(parentId, 'Parent capability ID');
      const parent = capabilities.get(parentId);
      if (!parent) throw new TypeError(`Unknown parent capability: ${parentId}`);
      if (parent.delegationDepth === 0)
        throw new Error('Capability delegation depth is exhausted.');
      if (parent.expiresAt !== undefined) {
        const currentTime = now();
        if (!Number.isFinite(currentTime))
          throw new TypeError('Configured clock must return finite time.');
        if (parent.expiresAt <= currentTime)
          throw new Error('Expired capabilities cannot be delegated.');
      }
      if (!input || typeof input !== 'object')
        throw new TypeError('Capability input must be an object.');
      const actions = scope(input.actions, 'Actions');
      const resources = scope(input.resources, 'Resources');
      if (actions.some((action) => !parent.actions.includes(action)))
        throw new Error('Delegated actions must be a subset of the parent scope.');
      if (resources.some((resource) => !parent.resources.includes(resource)))
        throw new Error('Delegated resources must be a subset of the parent scope.');
      if (
        parent.expiresAt !== undefined &&
        (input.expiresAt === undefined || input.expiresAt > parent.expiresAt)
      )
        throw new Error('Delegated expiration cannot exceed the parent expiration.');
      return issue({ ...input, actions, resources }, parent.delegationDepth - 1);
    },
    get: (id) => capabilities.get(id),
    list: () => Object.freeze([...capabilities.values()]),
    allows(id, subject, action, resource, at) {
      const capability = capabilities.get(id);
      if (!capability) return false;
      label(subject, 'Subject');
      label(action, 'Action');
      label(resource, 'Resource');
      const time = at ?? now();
      if (!Number.isFinite(time)) throw new TypeError('Evaluation time must be finite.');
      return (
        capability.subject === subject &&
        capability.actions.includes(action) &&
        capability.resources.includes(resource) &&
        (capability.expiresAt === undefined || time < capability.expiresAt)
      );
    },
  };
}
