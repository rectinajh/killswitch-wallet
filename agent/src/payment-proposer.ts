import { ethers } from 'ethers';
import { KilnClient, KilnResponse, KilnUsage } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { feeWei, totalCostWei, feePercentLabel } from './fees.js';

const SESSION_POLICY_ABI = [
  'function proposeOrPay(uint256 sessionId, address merchant, uint256 amount, string description) external',
  'event PaymentProposed(uint256 indexed sessionId, address indexed merchant, uint256 amount, string description)',
  'event PaymentExecuted(uint256 indexed sessionId, address indexed merchant, uint256 amount, uint256 fee, bytes32 receiptId)',
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
  /** Skip LLM entirely and use forced/fallback values (adversarial demos only) */
  skipLlm?: boolean;
  /** Call explainReceipt after propose (default true) */
  explain?: boolean;
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
  /** On-chain content receipt id (NOT the chain tx hash) */
  receiptId?: string;
}

export interface TokenUsageSplit {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  mock?: boolean;
}

/** W3C-style commerce credential — chain tx hash only, never on-chain receiptId */
export interface CommercePaymentCredential {
  type: 'CommercePaymentCredential';
  transactionHash: string;
  chain: string;
  chainId: number;
  explorerUrl?: string;
  sessionId: number;
  merchant?: string;
  amountEth?: string;
  status: 'executed' | 'denied' | 'unknown';
}

export interface PaymentResult {
  success: boolean;
  /** Ethers / RPC transaction hash — use this for explorer & CommercePaymentCredential */
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
  /** LLM explanation of outcome (when explain !== false) */
  explanation?: string;
  /** Token usage from propose and explain separately (for judges) */
  usage?: {
    propose?: TokenUsageSplit;
    explain?: TokenUsageSplit;
  };
  credential?: CommercePaymentCredential;
}

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

function toUsageSplit(u?: KilnUsage): TokenUsageSplit | undefined {
  if (!u) return undefined;
  return {
    promptTokens: u.promptTokens,
    completionTokens: u.completionTokens,
    totalTokens: u.totalTokens,
    mock: u.mock,
  };
}

export function resolveChainLabel(chainId: number): string {
  const fromEnv = process.env.CHAIN_LABEL?.trim();
  if (fromEnv) return fromEnv;
  if (chainId === 31337) return 'anvil';
  if (chainId === 11155111) return 'sepolia';
  return `chain-${chainId}`;
}

export function explorerUrlForTx(chainId: number, txHash: string): string | undefined {
  if (chainId === 11155111) {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
  return undefined;
}

export function buildCommercePaymentCredential(
  result: PaymentResult,
  sessionId: number,
  chainId: number
): CommercePaymentCredential | undefined {
  if (!result.transactionHash) return undefined;
  const denied = result.events.find((e) => e.type === 'denied');
  const executed = result.events.find((e) => e.type === 'executed');
  const last = denied || executed;
  return {
    type: 'CommercePaymentCredential',
    // ONLY ethers tx hash — never on-chain receiptId
    transactionHash: result.transactionHash,
    chain: resolveChainLabel(chainId),
    chainId,
    explorerUrl: explorerUrlForTx(chainId, result.transactionHash),
    sessionId,
    merchant: last?.merchant,
    amountEth: last?.amount,
    status: denied ? 'denied' : executed ? 'executed' : 'unknown',
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
        skipLlm: options.skipLlm,
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
      console.log(`  Agent: ${policy.agent}`);
      console.log(`  Allowed merchants: ${policy.merchants.length}`);
      console.log(`  Deadline: ${deadline.toISOString()}`);
      console.log(`  Fee model: amount + ${feePercentLabel()} (budget checks totalCost)`);

      let proposal: PaymentProposal;
      let kilnResponse: KilnResponse | undefined;

      const forced =
        options.skipLlm ||
        (options.forceAmountEth !== undefined && options.forceMerchant !== undefined);

      if (forced && options.skipLlm) {
        proposal = {
          merchant: options.forceMerchant || policy.merchants[0],
          amount: options.forceAmountEth || '0.01',
          description: userIntent,
          reasoning: 'Forced adversarial / demo proposal (skip LLM)',
        };
      } else {
        console.log('[PaymentProposer] Calling LLM for proposal...');
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

      console.log('[PaymentProposer] Proposal:');
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

      const result: PaymentResult = {
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
        usage: {
          propose: toUsageSplit(kilnResponse?.usage),
        },
      };

      const network = await this.signer.provider?.getNetwork();
      const chainId = network ? Number(network.chainId) : 31337;
      result.credential = buildCommercePaymentCredential(result, sessionId, chainId);

      if (options.explain !== false) {
        try {
          const { text, usage } = await this.explainResultWithUsage(result);
          result.explanation = text;
          if (!result.usage) result.usage = {};
          result.usage.explain = usage;
        } catch (explainErr) {
          console.warn('[PaymentProposer] explainReceipt failed:', explainErr);
        }
      }

      return result;
    } catch (error) {
      console.error('[PaymentProposer] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        events: [],
      };
    }
  }

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
          const feeAmt = parsed.args.fee as bigint;
          const receiptId =
            parsed.args.receiptId ?? parsed.args[4];
          events.push({
            type: 'executed',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(amountWei),
            amountWei: amountWei.toString(),
            fee: ethers.formatEther(feeAmt),
            feeWei: feeAmt.toString(),
            totalCost: ethers.formatEther(amountWei + feeAmt),
            totalCostWei: (amountWei + feeAmt).toString(),
            receiptId: receiptId,
          });
        } else if (parsed.name === 'PaymentDenied') {
          const amountWei = parsed.args.amount as bigint;
          const feeAmt = feeWei(amountWei);
          events.push({
            type: 'denied',
            merchant: parsed.args.merchant,
            amount: ethers.formatEther(amountWei),
            amountWei: amountWei.toString(),
            fee: ethers.formatEther(feeAmt),
            feeWei: feeAmt.toString(),
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

  async explainResultWithUsage(
    result: PaymentResult
  ): Promise<{ text: string; usage: TokenUsageSplit }> {
    if (!result.success) {
      return {
        text: `Payment failed: ${result.error || 'Unknown error'}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, mock: true },
      };
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

    // Pass ethers tx hash to explainer — not on-chain receiptId
    const kilnResponse = await this.kiln.explainReceipt({
      merchant: lastEvent.merchant,
      amount: lastEvent.amount,
      fee: feeDisplay,
      txHash: result.transactionHash || 'N/A',
      status: lastEvent.type === 'denied' ? 'denied' : 'executed',
      reason: lastEvent.reason,
    });

    this.kiln.reportUsage('explainReceipt', kilnResponse.usage);

    return {
      text: kilnResponse.content,
      usage: toUsageSplit(kilnResponse.usage)!,
    };
  }

  async explainResult(result: PaymentResult): Promise<string> {
    const { text } = await this.explainResultWithUsage(result);
    return text;
  }
}
