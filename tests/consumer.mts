import { createCapabilityModel, type CapabilityInput } from '@lp-labs/capability-model';

const input: CapabilityInput = {
  id: 'reader',
  subject: 'user:1',
  actions: ['read'],
  resources: ['document:1'],
};
const model = createCapabilityModel({ now: () => 1_000 });
model.grant(input);
console.log(model.allows('reader', 'user:1', 'read', 'document:1'));
