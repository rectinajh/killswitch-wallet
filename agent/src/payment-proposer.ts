import { ethers } from 'ethers';
import { KilnClient, KilnResponse, KilnUsage } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { feeWei, totalCostWei, feePercentLabel } from './fees.js';
import { formatUnitsAmount, isNativeToken, parseUnitsAmount } from './token.js';

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
  /** Human amount in session asset units (ETH or USDC/USDG) */
  amountEth?: string;
  amount?: string;
  /** Native ETH or ERC-20 symbol */
  token?: string;
  tokenAddress?: string;
  decimals?: number;
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

/** Well-known chain ids used by demos / Arbitrum Buildathon */
export const CHAIN_IDS = {
  anvil: 31337,
  ethereumSepolia: 11155111,
  arbitrumOne: 42161,
  arbitrumSepolia: 421614,
  /** Robinhood Chain testnet — confirm against current docs before relying on explorer */
  robinhoodTestnet: 20240603,
} as const;

export function resolveChainLabel(chainId: number): string {
  const fromEnv = process.env.CHAIN_LABEL?.trim();
  if (fromEnv) return fromEnv;
  if (chainId === CHAIN_IDS.anvil) return 'anvil';
  if (chainId === CHAIN_IDS.ethereumSepolia) return 'ethereum-sepolia';
  if (chainId === CHAIN_IDS.arbitrumSepolia) return 'arbitrum-sepolia';
  if (chainId === CHAIN_IDS.arbitrumOne) return 'arbitrum-one';
  if (chainId === CHAIN_IDS.robinhoodTestnet) return 'robinhood-testnet';
  return `chain-${chainId}`;
}

export function explorerUrlForTx(chainId: number, txHash: string): string | undefined {
  const hash = txHash?.startsWith('0x') ? txHash : `0x${txHash}`;
  if (chainId === CHAIN_IDS.ethereumSepolia) {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  }
  if (chainId === CHAIN_IDS.arbitrumSepolia) {
    return `https://sepolia.arbiscan.io/tx/${hash}`;
  }
  if (chainId === CHAIN_IDS.arbitrumOne) {
    return `https://arbiscan.io/tx/${hash}`;
  }
  if (chainId === CHAIN_IDS.robinhoodTestnet) {
    // Placeholder base — override with EXPLORER_TX_URL_PREFIX if the host changes
    const prefix =
      process.env.EXPLORER_TX_URL_PREFIX?.replace(/\/$/, '') ||
      'https://explorer.testnet.chain.robinhood.com/tx';
    return `${prefix}/${hash}`;
  }
  const prefix = process.env.EXPLORER_TX_URL_PREFIX?.replace(/\/$/, '');
  if (prefix) return `${prefix}/${hash}`;
  return undefined;
}

export function buildCommercePaymentCredential(
  result: PaymentResult,
  sessionId: number,
  chainId: number,
  settlement?: { symbol: string; token: string; decimals: number }
): CommercePaymentCredential | undefined {
  if (!result.transactionHash) return undefined;
  const denied = result.events.find((e) => e.type === 'denied');
  const executed = result.events.find((e) => e.type === 'executed');
  const last = denied || executed;
  const symbol = settlement?.symbol || (process.env.PAYMENT_TOKEN || 'ETH').toUpperCase();
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
    amount: last?.amount,
    token: symbol,
    tokenAddress: settlement?.token,
    decimals: settlement?.decimals,
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
      const decimals = policy.decimals ?? 18;
      const symbol = policy.symbol || (isNativeToken(policy.token) ? 'ETH' : 'TOKEN');
      const fmt = (v: bigint) => formatUnitsAmount(v, decimals);

      console.log('[PaymentProposer] Current policy:');
      console.log(`  Token: ${symbol}${isNativeToken(policy.token) ? ' (native)' : ` ${policy.token}`}`);
      console.log(`  Budget: ${fmt(policy.budget)} ${symbol}`);
      console.log(`  Remaining: ${fmt(remaining)} ${symbol}`);
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
            budget: fmt(policy.budget),
            remaining: fmt(remaining),
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

      const amountWei = parseUnitsAmount(proposal.amount, decimals);
      const fee = feeWei(amountWei);
      const total = totalCostWei(amountWei);

      console.log('[PaymentProposer] Proposal:');
      console.log(`  Merchant: ${proposal.merchant}`);
      console.log(`  Amount: ${proposal.amount} ${symbol} (${amountWei} base units)`);
      console.log(`  Fee (${feePercentLabel()}): ${fmt(fee)} ${symbol} (${fee} base)`);
      console.log(`  Total cost vs budget: ${fmt(total)} ${symbol}`);
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

      const events = this.parsePaymentEvents(receipt, decimals);

      const result: PaymentResult = {
        success: true,
        transactionHash: tx.hash,
        events,
        proposal: {
          ...proposal,
          amountWei: amountWei.toString(),
          feeWei: fee.toString(),
          feeEth: fmt(fee),
          totalCostWei: total.toString(),
          totalCostEth: fmt(total),
        },
        usage: {
          propose: toUsageSplit(kilnResponse?.usage),
        },
      };

      const network = await this.signer.provider?.getNetwork();
      const chainId = network ? Number(network.chainId) : 31337;
      result.credential = buildCommercePaymentCredential(result, sessionId, chainId, {
        symbol,
        token: policy.token,
        decimals,
      });

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

  private parsePaymentEvents(
    receipt: ethers.TransactionReceipt,
    decimals = 18
  ): PaymentEventDetail[] {
    const events: PaymentEventDetail[] = [];
    const fmt = (v: bigint) => formatUnitsAmount(v, decimals);

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
            amount: fmt(amountWei),
            amountWei: amountWei.toString(),
            fee: fmt(fee),
            feeWei: fee.toString(),
            totalCost: fmt(totalCostWei(amountWei)),
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
            amount: fmt(amountWei),
            amountWei: amountWei.toString(),
            fee: fmt(feeAmt),
            feeWei: feeAmt.toString(),
            totalCost: fmt(amountWei + feeAmt),
            totalCostWei: (amountWei + feeAmt).toString(),
            receiptId: receiptId,
          });
        } else if (parsed.name === 'PaymentDenied') {
          const amountWei = parsed.args.amount as bigint;
          const feeAmt = feeWei(amountWei);
          events.push({
            type: 'denied',
            merchant: parsed.args.merchant,
            amount: fmt(amountWei),
            amountWei: amountWei.toString(),
            fee: fmt(feeAmt),
            feeWei: feeAmt.toString(),
            totalCost: fmt(totalCostWei(amountWei)),
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
