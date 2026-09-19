import { ethers, EventLog } from 'ethers';
import { feeWei, totalCostWei, feePercentLabel } from './fees.js';

const SESSION_POLICY_ABI = [
  'function getSessionPolicy(uint256 sessionId) view returns (address owner, address agent, uint256 budget, uint256 spent, uint256 deadline, address[] memory merchants, bool frozen, bool active)',
  'function getRemainingBudget(uint256 sessionId) view returns (uint256)',
  'function checkMerchant(uint256 sessionId, address merchant) view returns (bool)',
  'function nextSessionId() view returns (uint256)',
  'event PaymentProposed(uint256 indexed sessionId, address indexed merchant, uint256 amount, string description)',
  'event PaymentExecuted(uint256 indexed sessionId, address indexed merchant, uint256 amount, uint256 fee, bytes32 receiptId)',
  'event PaymentDenied(uint256 indexed sessionId, address indexed merchant, uint256 amount, string reason)',
];

export interface SessionPolicy {
  owner: string;
  agent: string;
  budget: bigint;
  spent: bigint;
  deadline: bigint;
  merchants: string[];
  frozen: boolean;
  active: boolean;
}

export interface PaymentEvent {
  type: 'proposed' | 'executed' | 'denied';
  sessionId: number;
  merchant: string;
  amount: bigint;
  fee?: bigint;
  /** On-chain content receipt id — NOT the chain tx hash */
  receiptId?: string;
  reason?: string;
  description?: string;
  blockNumber: number;
  /** Ethers / RPC transaction hash */
  transactionHash: string;
}

export class PolicyReader {
  private contract: ethers.Contract;
  private provider: ethers.Provider;

  constructor(contractAddress: string, provider: ethers.Provider) {
    this.provider = provider;
    this.contract = new ethers.Contract(
      contractAddress,
      SESSION_POLICY_ABI,
      provider
    );
  }

  async getSessionPolicy(sessionId: number): Promise<SessionPolicy> {
    const policy = await this.contract.getSessionPolicy(sessionId);

    return {
      owner: policy.owner,
      agent: policy.agent,
      budget: policy.budget,
      spent: policy.spent,
      deadline: policy.deadline,
      merchants: policy.merchants,
      frozen: policy.frozen,
      active: policy.active,
    };
  }

  async getRemainingBudget(sessionId: number): Promise<bigint> {
    return await this.contract.getRemainingBudget(sessionId);
  }

  async checkMerchant(sessionId: number, merchant: string): Promise<boolean> {
    return await this.contract.checkMerchant(sessionId, merchant);
  }

  async getNextSessionId(): Promise<number> {
    return Number(await this.contract.nextSessionId());
  }

  async listRecentSessionIds(limit: number = 20): Promise<number[]> {
    const next = await this.getNextSessionId();
    const ids: number[] = [];
    for (let i = next - 1; i >= 0 && ids.length < limit; i--) {
      ids.push(i);
    }
    return ids;
  }

  async isSessionUsable(sessionId: number): Promise<{
    usable: boolean;
    reason?: string;
  }> {
    const policy = await this.getSessionPolicy(sessionId);

    if (!policy.active) {
      return { usable: false, reason: 'Session not active' };
    }

    if (policy.frozen) {
      return { usable: false, reason: 'Session frozen by owner' };
    }

    // Deadline is NOT blocked here — proposeOrPay records PaymentDenied so expiry is auditable.

    if (policy.spent >= policy.budget) {
      return { usable: false, reason: 'Budget fully spent' };
    }

    return { usable: true };
  }

  async getPaymentHistory(
    sessionId: number,
    fromBlock: number = 0
  ): Promise<PaymentEvent[]> {
    const events: PaymentEvent[] = [];

    const proposedFilter = this.contract.filters.PaymentProposed(sessionId);
    const proposedEvents = await this.contract.queryFilter(proposedFilter, fromBlock);
    for (const event of proposedEvents) {
      const args = (event as EventLog).args;
      if (!args) continue;
      events.push({
        type: 'proposed',
        sessionId: Number(args.sessionId),
        merchant: args.merchant,
        amount: args.amount,
        fee: feeWei(args.amount as bigint),
        description: args.description,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    const executedFilter = this.contract.filters.PaymentExecuted(sessionId);
    const executedEvents = await this.contract.queryFilter(executedFilter, fromBlock);
    for (const event of executedEvents) {
      const args = (event as EventLog).args;
      if (!args) continue;
      events.push({
        type: 'executed',
        sessionId: Number(args.sessionId),
        merchant: args.merchant,
        amount: args.amount,
        fee: args.fee,
        receiptId: args.receiptId,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    const deniedFilter = this.contract.filters.PaymentDenied(sessionId);
    const deniedEvents = await this.contract.queryFilter(deniedFilter, fromBlock);
    for (const event of deniedEvents) {
      const args = (event as EventLog).args;
      if (!args) continue;
      events.push({
        type: 'denied',
        sessionId: Number(args.sessionId),
        merchant: args.merchant,
        amount: args.amount,
        fee: feeWei(args.amount as bigint),
        reason: args.reason,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    events.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      const order = { proposed: 0, executed: 1, denied: 1 } as const;
      return order[a.type] - order[b.type];
    });

    return events;
  }

  formatPolicy(policy: SessionPolicy): string {
    const budgetEth = ethers.formatEther(policy.budget);
    const spentEth = ethers.formatEther(policy.spent);
    const remainingEth = ethers.formatEther(policy.budget - policy.spent);
    const deadline = new Date(Number(policy.deadline) * 1000);

    return `
Session Policy:
  Owner: ${policy.owner}
  Agent: ${policy.agent}
  Budget: ${budgetEth} ETH (max totalCost = amount + ${feePercentLabel()})
  Spent: ${spentEth} ETH
  Remaining: ${remainingEth} ETH
  Deadline: ${deadline.toISOString()}
  Merchants: ${policy.merchants.join(', ')}
  Status: ${policy.active ? (policy.frozen ? 'FROZEN' : 'ACTIVE') : 'CLOSED'}
    `.trim();
  }

  formatPaymentEvent(event: PaymentEvent): string {
    const amountEth = ethers.formatEther(event.amount);
    const status =
      event.type === 'executed'
        ? '✓ EXECUTED'
        : event.type === 'denied'
          ? '✗ DENIED'
          : '→ PROPOSED';

    let details = `
${status}
  Merchant: ${event.merchant}
  Amount: ${amountEth} ETH
  Block: ${event.blockNumber}
  Tx: ${event.transactionHash}
    `.trim();

    if (event.fee !== undefined) {
      details += `\n  Fee (${feePercentLabel()}): ${ethers.formatEther(event.fee)} ETH (${event.fee} wei)`;
      details += `\n  Total cost: ${ethers.formatEther(totalCostWei(event.amount))} ETH`;
    }

    if (event.type === 'executed' && event.receiptId) {
      details += `\n  Content receiptId: ${event.receiptId} (not chain tx hash)`;
    }

    if (event.type === 'denied' && event.reason) {
      details += `\n  Reason: ${event.reason}`;
    }

    if (event.description) {
      details += `\n  Description: ${event.description}`;
    }

    return details;
  }
}
