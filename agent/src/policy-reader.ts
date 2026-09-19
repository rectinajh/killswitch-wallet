import { ethers, EventLog } from 'ethers';
import { feeWei, totalCostWei, feePercentLabel } from './fees.js';

const SESSION_POLICY_ABI = [
  'function getSessionPolicy(uint256 sessionId) view returns (address owner, uint256 budget, uint256 spent, uint256 deadline, address[] memory merchants, bool frozen, bool active)',
  'function getRemainingBudget(uint256 sessionId) view returns (uint256)',
  'function checkMerchant(uint256 sessionId, address merchant) view returns (bool)',
  'function nextSessionId() view returns (uint256)',
  'event PaymentProposed(uint256 indexed sessionId, address indexed merchant, uint256 amount, string description)',
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
  type: 'proposed' | 'executed' | 'denied';
  sessionId: number;
  merchant: string;
  amount: bigint;
  fee?: bigint;
  txHash?: string;
  reason?: string;
  description?: string;
  blockNumber: number;
  transactionHash: string;
}

/**
 * PolicyReader: Read on-chain session policy and payment history
 *
 * This module reads policy boundaries from the smart contract.
 * IMPORTANT: The agent uses this for advisory purposes only.
 * Actual enforcement happens on-chain in SessionPolicy.sol.
 * Budget enforcement uses amount + 2% fee (see feeWei).
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

  async getRemainingBudget(sessionId: number): Promise<bigint> {
    return await this.contract.getRemainingBudget(sessionId);
  }

  async checkMerchant(sessionId: number, merchant: string): Promise<boolean> {
    return await this.contract.checkMerchant(sessionId, merchant);
  }

  async getNextSessionId(): Promise<number> {
    return Number(await this.contract.nextSessionId());
  }

  /**
   * List recent session ids (nextSessionId-1 .. max(0, next-limit))
   */
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
   * Public RPCs (e.g. Sepolia) often cap eth_getLogs ranges (~50k blocks).
   * When fromBlock is 0, start from CONTRACT_DEPLOY_BLOCK or a recent lookback,
   * and always page queries in chunks under the provider limit.
   */
  private async resolveLogRange(fromBlock: number): Promise<{ from: number; to: number }> {
    const latest = await this.provider.getBlockNumber();
    const chunkCap = Number(process.env.LOG_CHUNK_BLOCKS || 40_000);
    let from = fromBlock;
    if (!from || from <= 0) {
      const deploy = Number(process.env.CONTRACT_DEPLOY_BLOCK || 0);
      if (deploy > 0) {
        from = deploy;
      } else {
        from = Math.max(0, latest - chunkCap);
      }
    }
    // If still too wide, clamp start so a single page fits; chunked query covers the rest.
    if (latest - from > chunkCap * 50) {
      // Extremely wide: prefer deploy/lookback over scanning all of Sepolia history.
      from = Math.max(from, latest - chunkCap * 5);
    }
    return { from, to: latest };
  }

  private async queryFilterChunked(
    filter: ethers.DeferredTopicFilter,
    fromBlock: number,
    toBlock: number
  ): Promise<(ethers.Log | EventLog)[]> {
    const chunk = Number(process.env.LOG_CHUNK_BLOCKS || 40_000);
    const out: (ethers.Log | EventLog)[] = [];
    for (let start = fromBlock; start <= toBlock; start += chunk) {
      const end = Math.min(start + chunk - 1, toBlock);
      const part = await this.contract.queryFilter(filter, start, end);
      out.push(...part);
    }
    return out;
  }

  async getPaymentHistory(
    sessionId: number,
    fromBlock: number = 0
  ): Promise<PaymentEvent[]> {
    const events: PaymentEvent[] = [];
    const { from, to } = await this.resolveLogRange(fromBlock);

    const proposedFilter = this.contract.filters.PaymentProposed(sessionId);
    const proposedEvents = await this.queryFilterChunked(proposedFilter, from, to);
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
    const executedEvents = await this.queryFilterChunked(executedFilter, from, to);
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
    const deniedEvents = await this.queryFilterChunked(deniedFilter, from, to);
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
  Budget: ${budgetEth} ETH
  Spent: ${spentEth} ETH (includes ${feePercentLabel()} fees on executed payments)
  Remaining: ${remainingEth} ETH
  Deadline: ${deadline.toISOString()}
  Merchants: ${policy.merchants.join(', ')}
  Status: ${policy.active ? (policy.frozen ? 'FROZEN' : 'ACTIVE') : 'CLOSED'}
  Note: Budget check uses amount + ${feePercentLabel()} fee
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

    if (event.type === 'executed' && event.txHash) {
      details += `\n  Receipt Hash: ${event.txHash}`;
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
