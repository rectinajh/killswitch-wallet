import axios, { AxiosInstance } from 'axios';
import { buildAgentSystemPrompt } from './agent-context.js';

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
  /** Present when response came from mock path — not real API usage */
  mock?: boolean;
}

export interface KilnResponse {
  content: string;
  usage: KilnUsage;
  model: string;
  mock?: boolean;
}

/**
 * Kiln / OpenAI-compatible client for KillSwitch Wallet.
 *
 * Official Furiosa path: gpt-oss-120b via Kiln. Energy/cost claims (e.g. NPU vs GPU)
 * belong in JUDGE.md as stated assumptions — do not invent measured joules here.
 * Policy enforcement is on-chain; the model only proposes short JSON.
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
      console.warn('[KilnClient] MOCK mode — no real API calls; usage labeled mock');
      this.client = axios.create();
    }
  }

  get isMock(): boolean {
    return this.mockMode;
  }

  /**
   * Short JSON payment proposal. Policy is NOT in the model — contract enforces.
   * Typical target: ~400 max_tokens.
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
    const systemPrompt = buildAgentSystemPrompt({
      budgetEth: sessionPolicy.budget,
      remainingEth: sessionPolicy.remaining,
      merchants: sessionPolicy.merchants,
      deadlineIso: sessionPolicy.deadline.toISOString(),
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userIntent },
    ];

    if (this.mockMode) {
      return this.mockProposal(sessionPolicy, userIntent);
    }

    return this.chatCompletions(messages, 400);
  }

  /**
   * Short receipt explanation. Typical target: ~300 max_tokens.
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
    const systemPrompt =
      'KillSwitch receipt explainer. Reply in 2-4 short sentences. No markdown fences.';

    const userPrompt = `Explain outcome:
merchant=${transaction.merchant}
amount=${transaction.amount} ETH fee=${transaction.fee} ETH
status=${transaction.status}
${transaction.reason ? `reason=${transaction.reason}` : ''}
chainTx=${transaction.txHash}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    if (this.mockMode) {
      return this.mockExplanation(transaction);
    }

    return this.chatCompletions(messages, 300);
  }

  /**
   * POST /chat/completions. Passes reasoning_effort=low when accepted; retries without on 400.
   */
  private async chatCompletions(
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<KilnResponse> {
    const baseBody: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens,
      reasoning_effort: 'low',
    };

    try {
      let response;
      try {
        response = await this.client.post('/chat/completions', baseBody);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          const { reasoning_effort: _, ...withoutEffort } = baseBody;
          response = await this.client.post('/chat/completions', withoutEffort);
        } else {
          throw err;
        }
      }

      const choice = response.data.choices[0];
      const usage = response.data.usage || {};

      return {
        content: extractMessageText(choice.message),
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        },
        model: this.config.model,
        mock: false,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Kiln API error: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }

  private mockProposal(
    sessionPolicy: {
      budget: string;
      remaining: string;
      merchants: string[];
    },
    userIntent: string
  ): KilnResponse {
    console.log('[KilnClient] MOCK proposal (not real LLM usage)');

    const merchant =
      sessionPolicy.merchants[0] || '0x0000000000000000000000000000000000000000';
    const ethMatch = userIntent.match(/(\d+(?:\.\d+)?)\s*ETH/i);
    let amount = ethMatch ? ethMatch[1] : '0.05';
    const remaining = parseFloat(sessionPolicy.remaining);
    if (!Number.isNaN(remaining) && parseFloat(amount) > remaining) {
      amount = Math.max(0, remaining * 0.5)
        .toFixed(6)
        .replace(/\.?0+$/, '');
    }

    const proposal = {
      merchant,
      amount,
      description: `Mock payment based on: ${userIntent.substring(0, 50)}`,
      reasoning: `MOCK: first allowlisted merchant; amount ${amount} ETH; remaining ${sessionPolicy.remaining} ETH.`,
    };

    return {
      content: JSON.stringify(proposal),
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        mock: true,
      },
      model: `${this.config.model} (mock)`,
      mock: true,
    };
  }

  private mockExplanation(transaction: {
    merchant: string;
    amount: string;
    fee: string;
    status: 'executed' | 'denied';
    reason?: string;
  }): KilnResponse {
    console.log('[KilnClient] MOCK explanation (not real LLM usage)');

    let explanation: string;
    if (transaction.status === 'executed') {
      explanation = `MOCK: Payment executed — sent ${transaction.amount} ETH to ${transaction.merchant} (fee ${transaction.fee} ETH). On-chain receipt recorded.`;
    } else {
      explanation = `MOCK: Payment denied — ${transaction.reason || 'Policy violation'}. No funds transferred; denial is on-chain.`;
    }

    return {
      content: explanation,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        mock: true,
      },
      model: `${this.config.model} (mock)`,
      mock: true,
    };
  }

  reportUsage(flowName: string, usage: KilnUsage): void {
    const tag = usage.mock ? 'MOCK' : 'API';
    console.log(`[KilnClient] ${tag} usage for ${flowName}:`);
    console.log(`  Prompt tokens: ${usage.promptTokens}`);
    console.log(`  Completion tokens: ${usage.completionTokens}`);
    console.log(`  Total tokens: ${usage.totalTokens}`);
    console.log(`  Model: ${this.config.model}`);
  }
}
