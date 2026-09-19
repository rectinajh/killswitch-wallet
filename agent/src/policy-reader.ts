import { ethers, EventLog } from 'ethers';

const SESSION_POLICY_ABI = [
  'function getSessionPolicy(uint256 sessionId) view returns (address owner, uint256 budget, uint256 spent, uint256 deadline, address[] memory merchants, bool frozen, bool active)',
  'function getRemainingBudget(uint256 sessionId) view returns (uint256)',
  'function checkMerchant(uint256 sessionId, address merchant) view returns (bool)',
  'event PaymentExecuted(uint256 indexed sessionId, address indexed merchant, uint256 amount, uint256 fee, bytes32 txHash)',
  'event PaymentDenied(uint256 indexed sessionId, address indexed merchant, uint256 amount, string reason)',
];

export interface SessionPolicy {
  owner: string;
  budget: bigint;
  spent: bigint;
  deadline: bigint;
  merchants: string[];
  frozen: boolean;
  active: boolean;
}

export interface PaymentEvent {
  type: 'executed' | 'denied';
  sessionId: number;
  merchant: string;
  amount: bigint;
  fee?: bigint;
  txHash?: string;
  reason?: string;
  blockNumber: number;
  transactionHash: string;
}

/**
 * PolicyReader: Read on-chain session policy and payment history
 * 
 * This module reads policy boundaries from the smart contract.
 * IMPORTANT: The agent uses this for advisory purposes only.
 * Actual enforcement happens on-chain in SessionPolicy.sol.
 */
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

  /**
   * Read full session policy from contract
   */
  async getSessionPolicy(sessionId: number): Promise<SessionPolicy> {
    const policy = await this.contract.getSessionPolicy(sessionId);
    
    return {
      owner: policy.owner,
      budget: policy.budget,
      spent: policy.spent,
      deadline: policy.deadline,
      merchants: policy.merchants,
      frozen: policy.frozen,
      active: policy.active,
    };
  }

  /**
   * Get remaining budget (budget - spent)
   */
  async getRemainingBudget(sessionId: number): Promise<bigint> {
    return await this.contract.getRemainingBudget(sessionId);
  }

  /**
   * Check if a merchant is on the allowlist
   */
  async checkMerchant(sessionId: number, merchant: string): Promise<boolean> {
    return await this.contract.checkMerchant(sessionId, merchant);
  }

  /**
   * Check if session is currently usable
   */
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

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now > policy.deadline) {
      return { usable: false, reason: 'Session deadline expired' };
    }

    if (policy.spent >= policy.budget) {
      return { usable: false, reason: 'Budget fully spent' };
    }

    return { usable: true };
  }

  /**
   * Fetch payment history for a session
   */
  async getPaymentHistory(
    sessionId: number,
    fromBlock: number = 0
  ): Promise<PaymentEvent[]> {
    const events: PaymentEvent[] = [];

    const executedFilter = this.contract.filters.PaymentExecuted(sessionId);
    const executedEvents = await this.contract.queryFilter(
      executedFilter,
      fromBlock
    );

    for (const event of executedEvents) {
      const args = (event as EventLog).args;
      if (!args) continue;
      events.push({
        type: 'executed',
        sessionId: Number(args.sessionId),
        merchant: args.merchant,
        amount: args.amount,
        fee: args.fee,
        txHash: args.txHash,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    const deniedFilter = this.contract.filters.PaymentDenied(sessionId);
    const deniedEvents = await this.contract.queryFilter(
      deniedFilter,
      fromBlock
    );

    for (const event of deniedEvents) {
      const args = (event as EventLog).args;
      if (!args) continue;
      events.push({
        type: 'denied',
        sessionId: Number(args.sessionId),
        merchant: args.merchant,
        amount: args.amount,
        reason: args.reason,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    }

    events.sort((a, b) => a.blockNumber - b.blockNumber);

    return events;
  }

  /**
   * Format policy for display
   */
  formatPolicy(policy: SessionPolicy): string {
    const budgetEth = ethers.formatEther(policy.budget);
    const spentEth = ethers.formatEther(policy.spent);
    const remainingEth = ethers.formatEther(policy.budget - policy.spent);
    const deadline = new Date(Number(policy.deadline) * 1000);

    return `
Session Policy:
  Owner: ${policy.owner}
  Budget: ${budgetEth} ETH
  Spent: ${spentEth} ETH
  Remaining: ${remainingEth} ETH
  Deadline: ${deadline.toISOString()}
  Merchants: ${policy.merchants.join(', ')}
  Status: ${policy.active ? (policy.frozen ? 'FROZEN' : 'ACTIVE') : 'CLOSED'}
    `.trim();
  }

  /**
   * Format payment event for display
   */
  formatPaymentEvent(event: PaymentEvent): string {
    const amountEth = ethers.formatEther(event.amount);
    const status = event.type === 'executed' ? '✓ EXECUTED' : '✗ DENIED';

    let details = `
${status}
  Merchant: ${event.merchant}
  Amount: ${amountEth} ETH
  Block: ${event.blockNumber}
  Tx: ${event.transactionHash}
    `.trim();

    if (event.type === 'executed' && event.fee) {
      const feeEth = ethers.formatEther(event.fee);
      details += `\n  Fee: ${feeEth} ETH`;
      details += `\n  Receipt Hash: ${event.txHash}`;
    }

    if (event.type === 'denied' && event.reason) {
      details += `\n  Reason: ${event.reason}`;
    }

    return details;
  }
}
