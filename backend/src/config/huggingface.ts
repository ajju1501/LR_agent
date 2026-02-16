import { config } from './env';
import logger from '../utils/logger';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatCompletionResponse {
    id: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

class HuggingFaceClient {
    private baseURL: string;
    private token: string;
    private model: string;
    private maxRetries = 3;

    constructor() {
        this.baseURL = config.huggingface.baseURL;
        this.token = config.huggingface.token;
        this.model = config.huggingface.model;
    }

    /**
     * Core method to call the HF chat completions endpoint.
     */
    private async chatCompletion(
        messages: ChatMessage[],
        temperature: number = 0.3,
        maxTokens?: number
    ): Promise<ChatCompletionResponse> {
        const body: Record<string, any> = {
            model: this.model,
            messages,
            temperature,
        };

        if (maxTokens) {
            body.max_tokens = maxTokens;
        }

        const response = await fetch(`${this.baseURL}/chat/completions`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
        }

        return (await response.json()) as ChatCompletionResponse;
    }

    /**
     * Retry wrapper with exponential backoff for handling rate limit errors.
     */
    private async withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                const errorStr = String(error);
                const isRateLimit = errorStr.includes('429') || errorStr.includes('Too Many Requests');

                if (isRateLimit && attempt < this.maxRetries) {
                    const delayMs = Math.pow(2, attempt) * 1000;
                    logger.warn(`${label}: Rate limited (attempt ${attempt}/${this.maxRetries}), retrying in ${delayMs}ms`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }

                throw error;
            }
        }
        throw new Error(`${label}: All ${this.maxRetries} attempts exhausted`);
    }

    async isHealthy(): Promise<boolean> {
        try {
            const result = await this.withRetry(
                () =>
                    this.chatCompletion(
                        [{ role: 'user', content: 'ping' }],
                        0.1,
                        5
                    ),
                'Health check'
            );
            return !!result.choices?.[0]?.message?.content;
        } catch (error) {
            logger.warn('HuggingFace health check failed', { error: String(error) });
            return false;
        }
    }

    async generateResponse(prompt: string, temperature: number = 0.3): Promise<string> {
        try {
            const result = await this.withRetry(
                () =>
                    this.chatCompletion(
                        [{ role: 'user', content: prompt }],
                        temperature,
                        config.rag.chunkSize
                    ),
                'Generate response'
            );

            const content = result.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from HuggingFace API');
            }
            return content;
        } catch (error) {
            logger.error('Failed to generate response', {
                promptLength: prompt.length,
                error: String(error),
            });
            throw new Error(`Response generation failed: ${error}`);
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.withRetry(
                async () => {
                    const res = await fetch(`${this.baseURL.replace('/v1', '')}/pipeline/feature-extraction/${config.huggingface.embeddingModel}`, {
                        headers: {
                            Authorization: `Bearer ${this.token}`,
                            'Content-Type': 'application/json',
                        },
                        method: 'POST',
                        body: JSON.stringify({ inputs: text }),
                    });

                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(`HuggingFace Embedding API error (${res.status}): ${errorText}`);
                    }

                    return (await res.json()) as number[];
                },
                'Generate embedding'
            );

            // The API may return nested arrays; flatten if needed
            const flat = Array.isArray(response[0]) ? (response[0] as unknown as number[]) : response;
            return flat;
        } catch (error) {
            logger.error('Failed to generate embedding', {
                text: text.substring(0, 100),
                error: String(error),
            });
            throw new Error(`Embedding generation failed: ${error}`);
        }
    }

    async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (const text of texts) {
            const embedding = await this.generateEmbedding(text);
            embeddings.push(embedding);
        }
        return embeddings;
    }
}

export const huggingfaceClient = new HuggingFaceClient();
export default HuggingFaceClient;
