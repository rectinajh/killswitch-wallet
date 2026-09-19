import { ethers } from 'ethers';
import { KilnClient, KilnResponse } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';

const SESSION_POLICY_ABI = [
  'function proposeOrPay(uint256 sessionId, address merchant, uint256 amount, string calldata description) external',
];

export interface PaymentProposal {
  merchant: string;
  amount: string;
  description: string;
  reasoning: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  events: Array<{
    type: 'proposed' | 'executed' | 'denied';
    merchant: string;
    amount: string;
    reason?: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * PaymentProposer: Agent that proposes payments using Kiln LLM
 * 
 * CRITICAL SECURITY BOUNDARY:
 * - Agent proposes payments via LLM reasoning
 * - Agent CANNOT execute payments directly
 * - All enforcement happens on-chain in SessionPolicy contract
 * - Denial by contract is a valid, recorded outcome
 */
export class PaymentProposer {
  private contract: ethers.Contract;
  private kiln: KilnClient;
  private policyReader: PolicyReader;
  private signer: ethers.Signer;

  constructor(
    contractAddress: string,
    signer: ethers.Signer,
    kilnClient: KilnClient,
    policyReader: PolicyReader
  ) {
    this.signer = signer;
    this.contract = new ethers.Contract(
      contractAddress,
      SESSION_POLICY_ABI,
      signer
    );
    this.kiln = kilnClient;
    this.policyReader = policyReader;
  }

  /**
   * Propose and attempt a payment based on user intent
   * 
   * Flow:
   * 1. Read current policy from contract
   * 2. Use Kiln LLM to generate payment proposal
   * 3. Submit proposal to contract (contract enforces boundaries)
   * 4. Parse events to determine outcome
   */
  async proposePayment(
    sessionId: number,
    userIntent: string
  ): Promise<PaymentResult> {
    console.log(`\n[PaymentProposer] Processing intent: "${userIntent}"`);

    try {
      const policy = await this.policyReader.getSessionPolicy(sessionId);
      const usability = await this.policyReader.isSessionUsable(sessionId);

      if (!usability.usable) {
        return {
          success: false,
          error: `Session not usable: ${usability.reason}`,
          events: [],
        };
      }

      const remaining = policy.budget - policy.spent;
      const deadline = new Date(Number(policy.deadline) * 1000);

      console.log('[PaymentProposer] Current policy:');
      console.log(`  Budget: ${ethers.formatEther(policy.budget)} ETH`);
      console.log(`  Remaining: ${ethers.formatEther(remaining)} ETH`);
      console.log(`  Allowed merchants: ${policy.merchants.length}`);
      console.log(`  Deadline: ${deadline.toISOString()}`);

      console.log('[PaymentProposer] Calling Kiln LLM for proposal...');
      const kilnResponse: KilnResponse = await this.kiln.proposePayment(
        {
          budget: ethers.formatEther(policy.budget),
          remaining: ethers.formatEther(remaining),
          merchants: policy.merchants,
          deadline: deadline,
        },
        userIntent
      );

      this.kiln.reportUsage('proposePayment', kilnResponse.usage);

      let proposal: PaymentProposal;
      try {
        proposal = JSON.parse(kilnResponse.content);
      } catch {
        proposal = {
          merchant: policy.merchants[0],
          amount: '0.01',
          description: userIntent,
          reasoning: 'Fallback proposal due to parse error',
        };
      }

      console.log('[PaymentProposer] LLM proposal:');
      console.log(`  Merchant: ${proposal.merchant}`);
      console.log(`  Amount: ${proposal.amount} ETH`);
      console.log(`  Description: ${proposal.description}`);
      console.log(`  Reasoning: ${proposal.reasoning}`);

      console.log('[PaymentProposer] Submitting to smart contract...');
      const amountWei = ethers.parseEther(proposal.amount);
      
      const tx = await this.contract.proposeOrPay(
        sessionId,
        proposal.merchant,
        amountWei,
        proposal.description
      );

      console.log(`[PaymentProposer] Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[PaymentProposer] Transaction confirmed in block ${receipt.blockNumber}`);

      const events = this.parsePaymentEvents(receipt);

      return {
        success: true,
        transactionHash: tx.hash,
        events: events,
        usage: kilnResponse.usage,
      };
    } catch (error) {
      console.error('[PaymentProposer] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        events: [],
      };
    }
  }

  /**
   * Parse payment-related events from transaction receipt
   */
  private parsePaymentEvents(receipt: ethers.TransactionReceipt): Array<{
    type: 'proposed' | 'executed' | 'denied';
    merchant: string;
    amount: string;
    reason?: string;
  }> {
    const events: Array<{
      type: 'proposed' | 'executed' | 'denied';
      merchant: string;
      amount: string;
      reason?: string;
    }> = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (!parsed) continue;

        if (parsed.name === 'PaymentProposed') {
          events.push({
            type: 'proposed',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(parsed.args.amount),
          });
        } else if (parsed.name === 'PaymentExecuted') {
          events.push({
            type: 'executed',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(parsed.args.amount),
          });
        } else if (parsed.name === 'PaymentDenied') {
          events.push({
            type: 'denied',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(parsed.args.amount),
            reason: parsed.args.reason,
          });
        }
      } catch {
        continue;
      }
    }

    return events;
  }

  /**
   * Generate human-readable explanation of payment result
   */
  async explainResult(result: PaymentResult): Promise<string> {
    if (!result.success || result.events.length === 0) {
      return `Payment failed: ${result.error || 'Unknown error'}`;
    }

    const lastEvent = result.events[result.events.length - 1];

    const kilnResponse = await this.kiln.explainReceipt({
      merchant: lastEvent.merchant,
      amount: lastEvent.amount,
      fee: '0.002',
      txHash: result.transactionHash || 'N/A',
      status: lastEvent.type === 'executed' ? 'executed' : 'denied',
      reason: lastEvent.reason,
    });

    this.kiln.reportUsage('explainReceipt', kilnResponse.usage);

    return kilnResponse.content;
  }
}
