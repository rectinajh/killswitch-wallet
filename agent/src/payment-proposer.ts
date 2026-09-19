import { ethers } from 'ethers';
import { KilnClient, KilnResponse } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { feeWei, totalCostWei, feePercentLabel } from './fees.js';

const SESSION_POLICY_ABI = [
  'function proposeOrPay(uint256 sessionId, address merchant, uint256 amount, string description) external',
  'event PaymentProposed(uint256 indexed sessionId, address indexed merchant, uint256 amount, string description)',
  'event PaymentExecuted(uint256 indexed sessionId, address indexed merchant, uint256 amount, uint256 fee, bytes32 txHash)',
  'event PaymentDenied(uint256 indexed sessionId, address indexed merchant, uint256 amount, string reason)',
];

export interface PaymentProposal {
  merchant: string;
  amount: string;
  description: string;
  reasoning: string;
}

export interface ProposePaymentOptions {
  /** Bypass LLM amount — force this ETH amount (adversarial / demo) */
  forceAmountEth?: string;
  /** Bypass LLM merchant — force this address */
  forceMerchant?: string;
  /** Allow proposing an off-allowlist merchant (do not remap to allowlist) */
  allowOffAllowlist?: boolean;
  /** Skip LLM entirely and use forced/fallback values */
  skipLlm?: boolean;
}

export interface PaymentEventDetail {
  type: 'proposed' | 'executed' | 'denied';
  merchant: string;
  amount: string;
  amountWei?: string;
  fee?: string;
  feeWei?: string;
  totalCost?: string;
  totalCostWei?: string;
  reason?: string;
  receiptHash?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  events: PaymentEventDetail[];
  proposal?: PaymentProposal & {
    amountWei: string;
    feeWei: string;
    feeEth: string;
    totalCostWei: string;
    totalCostEth: string;
  };
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
 * - Budget check on-chain uses amount + 2% fee (see feeWei)
 */

function extractJsonObject(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('No JSON object found in model response');
  }
}

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
   * 2. Use Kiln LLM to generate payment proposal (unless forced)
   * 3. Submit proposal to contract (contract enforces amount+2% fee budget)
   * 4. Parse events to determine outcome
   */
  async proposePayment(
    sessionId: number,
    userIntent: string,
    options: ProposePaymentOptions = {}
  ): Promise<PaymentResult> {
    console.log(`\n[PaymentProposer] Processing intent: "${userIntent}"`);
    if (options.forceAmountEth || options.forceMerchant) {
      console.log('[PaymentProposer] Force options:', {
        forceAmountEth: options.forceAmountEth,
        forceMerchant: options.forceMerchant,
        allowOffAllowlist: options.allowOffAllowlist,
      });
    }

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
      console.log(`  Fee model: amount + ${feePercentLabel()} (budget checks totalCost)`);

      let proposal: PaymentProposal;
      let kilnResponse: KilnResponse | undefined;

      const forced =
        options.skipLlm ||
        (options.forceAmountEth !== undefined && options.forceMerchant !== undefined);

      if (forced) {
        proposal = {
          merchant: options.forceMerchant || policy.merchants[0],
          amount: options.forceAmountEth || '0.01',
          description: userIntent,
          reasoning: 'Forced adversarial / demo proposal (skip LLM)',
        };
      } else {
        console.log('[PaymentProposer] Calling Kiln LLM for proposal...');
        kilnResponse = await this.kiln.proposePayment(
          {
            budget: ethers.formatEther(policy.budget),
            remaining: ethers.formatEther(remaining),
            merchants: policy.merchants,
            deadline: deadline,
          },
          userIntent
        );

        this.kiln.reportUsage('proposePayment', kilnResponse.usage);
        console.log('[PaymentProposer] Raw LLM content:', kilnResponse.content);

        try {
          proposal = extractJsonObject(kilnResponse.content);
          if (
            !options.allowOffAllowlist &&
            (!proposal.merchant ||
              !policy.merchants
                .map((m) => m.toLowerCase())
                .includes(String(proposal.merchant).toLowerCase()))
          ) {
            proposal.merchant = policy.merchants[0];
          }
          if (!proposal.amount) proposal.amount = '0.01';
          proposal.amount = String(proposal.amount).replace(/[^0-9.]/g, '');
        } catch (err) {
          console.warn('[PaymentProposer] JSON parse failed:', err);
          proposal = {
            merchant: policy.merchants[0],
            amount: '0.01',
            description: userIntent,
            reasoning: 'Fallback proposal due to parse error',
          };
        }
      }

      if (options.forceAmountEth !== undefined) {
        proposal.amount = String(options.forceAmountEth).replace(/[^0-9.]/g, '');
      }
      if (options.forceMerchant !== undefined) {
        proposal.merchant = options.forceMerchant;
      }
      if (
        !options.allowOffAllowlist &&
        options.forceMerchant === undefined &&
        !policy.merchants
          .map((m) => m.toLowerCase())
          .includes(String(proposal.merchant).toLowerCase())
      ) {
        proposal.merchant = policy.merchants[0];
      }

      const amountWei = ethers.parseEther(proposal.amount);
      const fee = feeWei(amountWei);
      const total = totalCostWei(amountWei);

      console.log('[PaymentProposer] LLM proposal:');
      console.log(`  Merchant: ${proposal.merchant}`);
      console.log(`  Amount: ${proposal.amount} ETH (${amountWei} wei)`);
      console.log(`  Fee (${feePercentLabel()}): ${ethers.formatEther(fee)} ETH (${fee} wei)`);
      console.log(`  Total cost vs budget: ${ethers.formatEther(total)} ETH`);
      console.log(`  Description: ${proposal.description}`);
      console.log(`  Reasoning: ${proposal.reasoning}`);

      console.log('[PaymentProposer] Submitting to smart contract...');

      const tx = await this.contract.proposeOrPay(
        sessionId,
        proposal.merchant,
        amountWei,
        proposal.description || userIntent
      );

      console.log(`[PaymentProposer] Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[PaymentProposer] Transaction confirmed in block ${receipt.blockNumber}`);

      const events = this.parsePaymentEvents(receipt);

      return {
        success: true,
        transactionHash: tx.hash,
        events,
        proposal: {
          ...proposal,
          amountWei: amountWei.toString(),
          feeWei: fee.toString(),
          feeEth: ethers.formatEther(fee),
          totalCostWei: total.toString(),
          totalCostEth: ethers.formatEther(total),
        },
        usage: kilnResponse?.usage,
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
  private parsePaymentEvents(receipt: ethers.TransactionReceipt): PaymentEventDetail[] {
    const events: PaymentEventDetail[] = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (!parsed) continue;

        if (parsed.name === 'PaymentProposed') {
          const amountWei = parsed.args.amount as bigint;
          const fee = feeWei(amountWei);
          events.push({
            type: 'proposed',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(amountWei),
            amountWei: amountWei.toString(),
            fee: ethers.formatEther(fee),
            feeWei: fee.toString(),
            totalCost: ethers.formatEther(totalCostWei(amountWei)),
            totalCostWei: totalCostWei(amountWei).toString(),
          });
        } else if (parsed.name === 'PaymentExecuted') {
          const amountWei = parsed.args.amount as bigint;
          const fee = parsed.args.fee as bigint;
          events.push({
            type: 'executed',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(amountWei),
            amountWei: amountWei.toString(),
            fee: ethers.formatEther(fee),
            feeWei: fee.toString(),
            totalCost: ethers.formatEther(amountWei + fee),
            totalCostWei: (amountWei + fee).toString(),
            receiptHash: parsed.args.txHash,
          });
        } else if (parsed.name === 'PaymentDenied') {
          const amountWei = parsed.args.amount as bigint;
          const fee = feeWei(amountWei);
          events.push({
            type: 'denied',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(amountWei),
            amountWei: amountWei.toString(),
            fee: ethers.formatEther(fee),
            feeWei: fee.toString(),
            totalCost: ethers.formatEther(totalCostWei(amountWei)),
            totalCostWei: totalCostWei(amountWei).toString(),
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
    if (!result.success) {
      return `Payment failed: ${result.error || 'Unknown error'}`;
    }

    const lastEvent = result.events[result.events.length - 1] || {
      type: 'executed' as const,
      merchant: 'unknown',
      amount: 'unknown',
    };

    const feeDisplay =
      lastEvent.fee !== undefined
        ? `${lastEvent.fee} ETH (${lastEvent.feeWei || ''} wei, ${feePercentLabel()})`
        : result.proposal
          ? `${result.proposal.feeEth} ETH (${result.proposal.feeWei} wei, ${feePercentLabel()})`
          : `0 (${feePercentLabel()} of amount)`;

    const kilnResponse = await this.kiln.explainReceipt({
      merchant: lastEvent.merchant,
      amount: lastEvent.amount,
      fee: feeDisplay,
      txHash: result.transactionHash || 'N/A',
      status: lastEvent.type === 'denied' ? 'denied' : 'executed',
      reason: lastEvent.reason,
    });

    this.kiln.reportUsage('explainReceipt', kilnResponse.usage);

    return kilnResponse.content;
  }
}
