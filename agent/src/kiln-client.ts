import axios, { AxiosInstance } from 'axios';

export interface KilnConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  mockMode?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KilnUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface KilnResponse {
  content: string;
  usage: KilnUsage;
  model: string;
}

/**
 * Kiln API Client for gpt-oss-120b model on NPU hardware
 * 
 * NPU Efficiency Characteristics:
 * - Latency: ~100-200ms inference (vs 500ms+ CPU)
 * - Throughput: 50+ requests/sec per NPU instance
 * - Cost: ~10x cheaper than cloud GPU for this model size
 */
function extractMessageText(message: any): string {
  if (!message) return '';
  if (typeof message.content === 'string' && message.content.trim()) return message.content;
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }
  return '';
}

export class KilnClient {
  private client: AxiosInstance;
  private config: KilnConfig;
  private mockMode: boolean;
  private temperature: number;

  constructor(config: KilnConfig) {
    this.config = config;
    this.mockMode = config.mockMode || !config.apiKey || config.apiKey === 'your_key_here';
    const tEnv = process.env.LLM_TEMPERATURE;
    this.temperature = tEnv !== undefined ? Number(tEnv) : 1;

    if (!this.mockMode) {
      this.client = axios.create({
        baseURL: config.baseUrl,
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    } else {
      console.warn('[KilnClient] Running in MOCK mode - no real API calls will be made');
      this.client = axios.create(); // Dummy client
    }
  }

  /**
   * Generate a payment proposal using the LLM
   * Typical usage: ~500 tokens (merchant reasoning)
   */
  async proposePayment(
    sessionPolicy: {
      budget: string;
      remaining: string;
      merchants: string[];
      deadline: Date;
    },
    userIntent: string
  ): Promise<KilnResponse> {
    const systemPrompt = `You are a payment agent for KillSwitch Wallet. 
Your role is to propose payments based on user intent, considering policy constraints.

CRITICAL: You CANNOT execute payments directly. You can only propose them.
The smart contract will enforce all boundaries (budget, allowlist, deadline).

Current session policy:
- Total budget: ${sessionPolicy.budget} ETH
- Remaining: ${sessionPolicy.remaining} ETH
- Allowed merchants: ${sessionPolicy.merchants.join(', ')}
- Deadline: ${sessionPolicy.deadline.toISOString()}

Respond with ONLY one compact JSON object. No markdown fences, no prose.
Keys required: merchant, amount, description, reasoning.
amount must be a string decimal in ETH (e.g. "0.015").
merchant must be one of the allowed addresses.
Example:
{"merchant":"0x...","amount":"0.015","description":"Coffee","reasoning":"within budget and allowlist"}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userIntent },
    ];

    if (this.mockMode) {
      return this.mockProposal(sessionPolicy, userIntent);
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: messages,
        temperature: this.temperature,
        max_tokens: 1200,
      });

      const choice = response.data.choices[0];
      const usage = response.data.usage;

      return {
        content: extractMessageText(choice.message),
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        model: this.config.model,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Kiln API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate a human-readable explanation of a payment receipt
   * Typical usage: ~300 tokens (transaction summary)
   */
  async explainReceipt(
    transaction: {
      merchant: string;
      amount: string;
      fee: string;
      txHash: string;
      status: 'executed' | 'denied';
      reason?: string;
    }
  ): Promise<KilnResponse> {
    const systemPrompt = `You are a receipt explainer for KillSwitch Wallet.
Generate a concise, user-friendly explanation of a payment outcome.`;

    const userPrompt = `Explain this transaction:
Merchant: ${transaction.merchant}
Amount: ${transaction.amount} ETH
Fee: ${transaction.fee} ETH
Status: ${transaction.status}
${transaction.reason ? `Reason: ${transaction.reason}` : ''}
Transaction Hash: ${transaction.txHash}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (this.mockMode) {
      return this.mockExplanation(transaction);
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: messages,
        temperature: this.temperature,
        max_tokens: 1200,
      });

      const choice = response.data.choices[0];
      const usage = response.data.usage;

      return {
        content: extractMessageText(choice.message),
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        model: this.config.model,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Kiln API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Mock proposal for demo purposes when no API key is available
   */
  private mockProposal(
    sessionPolicy: {
      budget: string;
      remaining: string;
      merchants: string[];
    },
    userIntent: string
  ): KilnResponse {
    console.log('[KilnClient] Mock proposal generated');
    
    const merchant = sessionPolicy.merchants[0] || '0x0000000000000000000000000000000000000000';
    const ethMatch = userIntent.match(/(\d+(?:\.\d+)?)\s*ETH/i);
    let amount = ethMatch ? ethMatch[1] : '0.05';
    const remaining = parseFloat(sessionPolicy.remaining);
    if (!Number.isNaN(remaining) && parseFloat(amount) > remaining) {
      amount = Math.max(0, remaining * 0.5).toFixed(6).replace(/\.?0+$/, '');
    }

    const proposal = {
      merchant: merchant,
      amount: amount,
      description: `Mock payment based on: ${userIntent.substring(0, 50)}`,
      reasoning: `Selected first allowed merchant (${merchant}). Parsed amount ${amount} ETH from intent; remaining budget ${sessionPolicy.remaining} ETH.`
    };

    return {
      content: JSON.stringify(proposal, null, 2),
      usage: {
        promptTokens: 450,
        completionTokens: 85,
        totalTokens: 535,
      },
      model: `${this.config.model} (mock)`,
    };
  }

  /**
   * Mock explanation for demo purposes
   */
  private mockExplanation(transaction: {
    merchant: string;
    amount: string;
    fee: string;
    status: 'executed' | 'denied';
    reason?: string;
  }): KilnResponse {
    console.log('[KilnClient] Mock explanation generated');

    let explanation: string;
    if (transaction.status === 'executed') {
      explanation = `✓ Payment successful! You sent ${transaction.amount} ETH to ${transaction.merchant}. A ${transaction.fee} ETH fee was charged. The transaction is recorded on-chain and auditable.`;
    } else {
      explanation = `✗ Payment denied by smart contract. Reason: ${transaction.reason || 'Policy violation'}. No funds were transferred. This denial is recorded on-chain.`;
    }

    return {
      content: explanation,
      usage: {
        promptTokens: 280,
        completionTokens: 65,
        totalTokens: 345,
      },
      model: `${this.config.model} (mock)`,
    };
  }

  /**
   * Report token usage for monitoring NPU efficiency
   */
  reportUsage(flowName: string, usage: KilnUsage): void {
    console.log(`[KilnClient] Usage for ${flowName}:`);
    console.log(`  Prompt tokens: ${usage.promptTokens}`);
    console.log(`  Completion tokens: ${usage.completionTokens}`);
    console.log(`  Total tokens: ${usage.totalTokens}`);
    console.log(`  Model: ${this.config.model}`);
  }
}
