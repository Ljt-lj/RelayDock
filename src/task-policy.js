'use strict';

const DEFAULT_MAX_STEPS = 32;
const MAX_STEPS_LIMIT = 100;
const DEFAULT_COMPLETE_TASK_FIRST = true;

const COMPLETE_TASK_FIRST_CONSTRAINT = [
  'Completion-first policy: make the maximum reasonable progress toward the task.',
  'Do not stop or report the task incomplete merely because a required capability is not registered as a dedicated tool.',
  'When the missing capability requires local execution or protected access, request approval through propose_run_command with the exact executable or script and a clear reason.',
  'After the real tool result is returned, continue the task and finish the remaining work.'
].join(' ');

function normalizeMaxSteps(value, fallback = DEFAULT_MAX_STEPS) {
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumber)
    ? Math.max(1, Math.min(MAX_STEPS_LIMIT, Math.trunc(fallbackNumber)))
    : DEFAULT_MAX_STEPS;
  if (value === undefined || value === null || value === '') return safeFallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return safeFallback;
  return Math.max(1, Math.min(MAX_STEPS_LIMIT, Math.trunc(number)));
}

function normalizeCompleteTaskFirst(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_COMPLETE_TASK_FIRST;
  if (typeof value === 'string') {
    return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function taskPolicyFromContract(contract = {}) {
  return {
    completeTaskFirst: normalizeCompleteTaskFirst(contract.completeTaskFirst),
    maxSteps: normalizeMaxSteps(contract.maxSteps)
  };
}

function effectiveConstraints(contract = {}) {
  const constraints = Array.isArray(contract.constraints)
    ? contract.constraints.map(String).filter((item) => item.trim())
    : [];
  const policy = taskPolicyFromContract(contract);
  if (!policy.completeTaskFirst) return constraints;
  if (constraints.some((item) => item.includes('Completion-first policy:'))) return constraints;
  return [...constraints, COMPLETE_TASK_FIRST_CONSTRAINT];
}

function taskPolicySystemPrompt(contract = {}) {
  const policy = taskPolicyFromContract(contract);
  const lines = [];
  if (policy.completeTaskFirst) {
    lines.push(COMPLETE_TASK_FIRST_CONSTRAINT);
    lines.push('A pending approval is an expected pause, not a failed task. Resume from the real tool result.');
  }
  lines.push('Tool-step budget for this task: ' + policy.maxSteps + '.');
  return lines.join('\n');
}

module.exports = {
  COMPLETE_TASK_FIRST_CONSTRAINT,
  DEFAULT_COMPLETE_TASK_FIRST,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_LIMIT,
  effectiveConstraints,
  normalizeCompleteTaskFirst,
  normalizeMaxSteps,
  taskPolicyFromContract,
  taskPolicySystemPrompt
};
