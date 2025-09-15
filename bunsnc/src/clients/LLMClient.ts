/**
 * LLM Client - Local DeepSeek 1.5B LLM integration via Ollama
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from '../utils/Logger';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  context_length?: number;
}

export interface LLMResponse {
  message: {
    role: string;
    content: string;
  };
  model: string;
  created_at: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  context?: number[];
}

export interface LLMStreamResponse {
  message: {
    role: string;
    content: string;
  };
  model: string;
  created_at: string;
  done: boolean;
}

export interface LLMConfig {
  host: string;
  port: number;
  timeout: number;
  default_model: string;
  max_tokens: number;
  temperature: number;
}

export class LLMClient {
  private baseUrl: string;
  private config: LLMConfig;
  private timeout: number;

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      host: config?.host || process.env.LLM_HOST || '10.219.8.210',
      port: config?.port || parseInt(process.env.LLM_PORT || '11434'),
      timeout: config?.timeout || parseInt(process.env.LLM_TIMEOUT || '60000'),
      default_model: config?.default_model || process.env.LLM_MODEL || 'deepseek-coder:1.3b',
      max_tokens: config?.max_tokens || parseInt(process.env.LLM_MAX_TOKENS || '2048'),
      temperature: config?.temperature || parseFloat(process.env.LLM_TEMPERATURE || '0.7')
    };

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
    this.timeout = this.config.timeout;

    logger.info(` [LLMClient] Initialized with URL: ${this.baseUrl}, Model: ${this.config.default_model}`);
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<LLMResponse> {
    try {
      if (!messages || messages.length === 0) {
        throw new Error('At least one message is required');
      }

      const requestBody: LLMRequest = {
        model: options.model || this.config.default_model,
        messages,
        stream: options.stream || false,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.max_tokens || this.config.max_tokens
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: LLMResponse = await response.json();

      logger.debug(` [LLMClient] Generated response with ${result.eval_count || 0} tokens in ${result.total_duration ? Math.round(result.total_duration / 1000000) : 0}ms`);

      return result;

    } catch (error) {
      logger.error(' [LLMClient] Response generation failed:', error);
      throw error;
    }
  }

  async generateStreamResponse(
    messages: LLMMessage[],
    onChunk: (chunk: LLMStreamResponse) => void,
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
    } = {}
  ): Promise<void> {
    try {
      if (!messages || messages.length === 0) {
        throw new Error('At least one message is required');
      }

      const requestBody: LLMRequest = {
        model: options.model || this.config.default_model,
        messages,
        stream: true,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.max_tokens || this.config.max_tokens
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM streaming failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const parsed: LLMStreamResponse = JSON.parse(line);
              onChunk(parsed);

              if (parsed.done) {
                return;
              }
            } catch (parseError) {
              logger.warn(' [LLMClient] Failed to parse stream chunk:', parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      logger.error(' [LLMClient] Stream generation failed:', error);
      throw error;
    }
  }

  async generateCompletion(
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
      system?: string;
    } = {}
  ): Promise<string> {
    const messages: LLMMessage[] = [];

    if (options.system) {
      messages.push({
        role: 'system',
        content: options.system
      });
    }

    messages.push({
      role: 'user',
      content: prompt
    });

    const response = await this.generateResponse(messages, options);
    return response.message.content;
  }

  async analyzeTicket(
    ticketData: any,
    options: {
      model?: string;
      temperature?: number;
    } = {}
  ): Promise<string> {
    const systemPrompt = `You are an expert IT support analyst. Analyze the following ServiceNow ticket and provide:
1. Problem classification
2. Likely root cause
3. Resolution steps
4. Escalation criteria

Be concise and technical. Focus on actionable insights.`;

    const userPrompt = `Ticket Details:
Title: ${ticketData.short_description || 'N/A'}
Description: ${ticketData.description || 'N/A'}
Category: ${ticketData.category || 'N/A'}
Priority: ${ticketData.priority || 'N/A'}
Assignment Group: ${ticketData.assignment_group || 'N/A'}

Provide your analysis:`;

    return await this.generateCompletion(userPrompt, {
      ...options,
      system: systemPrompt,
      temperature: options.temperature || 0.3
    });
  }

  async generateResolutionSteps(
    problem: string,
    context: string = '',
    options: {
      model?: string;
      temperature?: number;
    } = {}
  ): Promise<string[]> {
    const systemPrompt = `You are an expert IT troubleshooting specialist. Generate clear, step-by-step resolution instructions.
Output format: Return ONLY numbered steps, one per line.`;

    const userPrompt = `Problem: ${problem}
Context: ${context}

Generate resolution steps:`;

    const response = await this.generateCompletion(userPrompt, {
      ...options,
      system: systemPrompt,
      temperature: options.temperature || 0.2
    });

    return response
      .split('\n')
      .filter(line => line.trim() && /^\d+\./.test(line.trim()))
      .map(step => step.trim());
  }

  async summarizeDocument(
    content: string,
    maxLength: number = 200,
    options: {
      model?: string;
      temperature?: number;
    } = {}
  ): Promise<string> {
    const systemPrompt = `You are a technical documentation expert. Summarize the following content in ${maxLength} characters or less.
Focus on key technical information and actionable insights.`;

    const userPrompt = `Document Content:
${content.substring(0, 4000)}

Provide a concise summary:`;

    return await this.generateCompletion(userPrompt, {
      ...options,
      system: systemPrompt,
      temperature: options.temperature || 0.3,
      max_tokens: Math.ceil(maxLength / 3)
    });
  }

  async extractKeywords(
    text: string,
    maxKeywords: number = 10,
    options: {
      model?: string;
      temperature?: number;
    } = {}
  ): Promise<string[]> {
    const systemPrompt = `You are a text analysis expert. Extract the most important technical keywords and phrases from the given text.
Return ONLY a comma-separated list of keywords, maximum ${maxKeywords} items.`;

    const userPrompt = `Text to analyze:
${text.substring(0, 2000)}

Extract keywords:`;

    const response = await this.generateCompletion(userPrompt, {
      ...options,
      system: systemPrompt,
      temperature: options.temperature || 0.1,
      max_tokens: 200
    });

    return response
      .split(',')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .slice(0, maxKeywords);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const data = await response.json();
        logger.debug(` [LLMClient] Health check passed - Available models: ${data.models?.length || 0}`);
        return true;
      }

      logger.warn(` [LLMClient] Health check returned status: ${response.status}`);
      return false;

    } catch (error) {
      logger.error(' [LLMClient] Health check failed:', error);
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [this.config.default_model];

    } catch (error) {
      logger.error(' [LLMClient] Failed to get models:', error);
      return [this.config.default_model];
    }
  }

  async pullModel(modelName: string): Promise<boolean> {
    try {
      logger.info(`⬇️ [LLMClient] Pulling model: ${modelName}`);

      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(300000) // 5 minutes for model pulling
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
      }

      logger.info(` [LLMClient] Model pulled successfully: ${modelName}`);
      return true;

    } catch (error) {
      logger.error(` [LLMClient] Failed to pull model ${modelName}:`, error);
      return false;
    }
  }

  async getModelInfo(modelName?: string): Promise<any> {
    try {
      const model = modelName || this.config.default_model;
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      const info = await response.json();
      logger.debug(` [LLMClient] Model info for ${model}:`, info);
      return info;

    } catch (error) {
      logger.error(` [LLMClient] Failed to get model info for ${modelName}:`, error);
      return null;
    }
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const healthy = await this.healthCheck();
      const latency = Date.now() - startTime;

      if (healthy) {
        return {
          success: true,
          latency
        };
      } else {
        return {
          success: false,
          error: 'Health check failed'
        };
      }

    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async warmup(): Promise<boolean> {
    try {
      logger.info('🔥 [LLMClient] Warming up LLM service...');

      await this.generateCompletion('Hello, this is a test message to warm up the model.', {
        max_tokens: 50,
        temperature: 0.1
      });

      logger.info(' [LLMClient] Service warmup completed');
      return true;

    } catch (error) {
      logger.error(' [LLMClient] Service warmup failed:', error);
      return false;
    }
  }
}

export default LLMClient;