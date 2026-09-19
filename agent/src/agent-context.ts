/**
 * Exact Chain-aware / Privacy-minimized context injected into the payment LLM.
 * Intentionally excludes wallet history, other sessions, and secrets.
 * Policy is NOT enforced here — SessionPolicy.sol is the Guard.
 */
export type SessionPolicyView = {
  budgetEth: string;
  remainingEth: string;
  spentEth?: string;
  merchants: string[];
  deadlineIso: string;
  frozen?: boolean;
  active?: boolean;
  sessionId?: number;
};

export function buildAgentSystemPrompt(policy: SessionPolicyView): string {
  return `KillSwitch payment agent. Propose only; contract enforces budget/allowlist/deadline.
Session: budget=${policy.budgetEth}ETH remaining=${policy.remainingEth}ETH merchants=${policy.merchants.join(',')} deadline=${policy.deadlineIso}
Reply with ONE compact JSON object only (no markdown): {"merchant":"0x...","amount":"0.015","description":"...","reasoning":"..."}
merchant must be allowlisted; amount is ETH decimal string.`;
}

export function buildAgentContextPreview(
  policy: SessionPolicyView,
  userIntent: string
) {
  const system = buildAgentSystemPrompt(policy);
  const user = userIntent;
  return {
    privacy: {
      principle: 'Minimal Chain-aware Context — no full wallet history',
      included: [
        'session budget / remaining / allowlist / deadline',
        'user intent for this propose only',
      ],
      excluded: [
        'other sessions',
        'full tx history',
        'private keys',
        'API keys',
        'unrelated wallet balances',
      ],
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    approxChars: system.length + user.length,
    sessionId: policy.sessionId ?? null,
  };
}
