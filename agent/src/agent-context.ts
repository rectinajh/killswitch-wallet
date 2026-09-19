/**
 * Exact Chain-aware / Privacy-minimized context injected into the payment LLM.
 * Intentionally excludes wallet history, other sessions, and secrets.
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
  return `You are a payment agent for KillSwitch Wallet. 
Your role is to propose payments based on user intent, considering policy constraints.

CRITICAL: You CANNOT execute payments directly. You can only propose them.
The smart contract will enforce all boundaries (budget, allowlist, deadline).

Current session policy:
- Total budget: ${policy.budgetEth} ETH
- Remaining: ${policy.remainingEth} ETH
- Allowed merchants: ${policy.merchants.join(', ')}
- Deadline: ${policy.deadlineIso}

Respond with ONLY one compact JSON object. No markdown fences, no prose.
Keys required: merchant, amount, description, reasoning.
amount must be a string decimal in ETH (e.g. "0.015").
merchant must be one of the allowed addresses.
Example:
{"merchant":"0x...","amount":"0.015","description":"Coffee","reasoning":"within budget and allowlist"}`;
}

export function buildAgentContextPreview(
  policy: SessionPolicyView,
  userIntent: string
) {
  const system = buildAgentSystemPrompt(policy);
  const user = `User wants to: ${userIntent}

Propose a payment that fits within the policy constraints.`;
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
