import capabilities = require('@lp-labs/capability-model');

const model = capabilities.createCapabilityModel();
model.grant({
  id: 'writer',
  subject: 'user:2',
  actions: ['write'],
  resources: ['document:2'],
  delegationDepth: 1,
});
model.delegate('writer', {
  id: 'writer-child',
  subject: 'user:3',
  actions: ['write'],
  resources: ['document:2'],
});
