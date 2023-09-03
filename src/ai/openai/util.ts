import {
  AIGenerateTextTraceStepBuilder,
  GenerateTextRequestBuilder,
  GenerateTextResponseBuilder,
} from '../../tracing/index.js';
import { GenerateTextModelConfig } from '../types.js';

import { modelInfoOpenAI } from './info.js';
import {
  OpenAIAudioRequest,
  OpenAIChatGenerateRequest,
  OpenAIChatGenerateResponse,
  OpenAIGenerateRequest,
  OpenAIGenerateTextResponse,
  OpenAIOptions,
} from './types.js';

export const generateReq = (
  prompt: string,
  opt: Readonly<OpenAIOptions>,
  stopSequences: readonly string[]
): OpenAIGenerateRequest => {
  if (stopSequences.length > 4) {
    throw new Error(
      'OpenAI supports prompts with max 4 items in stopSequences'
    );
  }
  return {
    model: opt.model,
    prompt,
    suffix: opt.suffix ?? null,
    max_tokens: opt.maxTokens,
    temperature: opt.temperature,
    top_p: opt.topP ?? 1,
    n: opt.n,
    stream: opt.stream,
    logprobs: opt.logprobs,
    echo: opt.echo,
    stop: stopSequences,
    presence_penalty: opt.presencePenalty,
    frequency_penalty: opt.frequencyPenalty,
    best_of: opt.bestOf,
    logit_bias: opt.logitBias,
    user: opt.user,
  };
};

export const generateChatReq = (
  prompt: string,
  opt: Readonly<OpenAIOptions>,
  stopSequences: readonly string[]
): OpenAIChatGenerateRequest => {
  if (stopSequences.length > 4) {
    throw new Error(
      'OpenAI supports prompts with max 4 items in stopSequences'
    );
  }
  return {
    model: opt.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opt.maxTokens,
    temperature: opt.temperature,
    top_p: opt.topP ?? 1,
    n: opt.n,
    stream: opt.stream,
    stop: stopSequences,
    presence_penalty: opt.presencePenalty,
    frequency_penalty: opt.frequencyPenalty,
    logit_bias: opt.logitBias,
    user: opt.user,
  };
};

export const generateAudioReq = (
  opt: Readonly<OpenAIOptions>,
  prompt?: string,
  language?: string
): OpenAIAudioRequest => {
  if (!opt.audioModel) {
    throw new Error('OpenAI audio model not set');
  }

  return {
    model: opt.audioModel,
    prompt,
    temperature: opt.temperature,
    language,
    response_format: 'verbose_json',
  };
};

export const generateTraceOpenAI = (
  request: Readonly<OpenAIGenerateRequest>,
  response: Readonly<OpenAIGenerateTextResponse>
): AIGenerateTextTraceStepBuilder => {
  const {
    model,
    prompt,
    max_tokens,
    temperature,
    top_p,
    n,
    stream,
    presence_penalty,
    frequency_penalty,
    logit_bias,
    user,
    organization,
  } = request;

  // Fetching model info
  const mi = modelInfoOpenAI.find((item) => item.name === model);
  const modelInfo = { ...mi, name: model, provider: 'openai' };

  // Configure GenerateTextModel based on OpenAIGenerateRequest
  const modelConfig: GenerateTextModelConfig = {
    maxTokens: max_tokens,
    temperature: temperature,
    topP: top_p,
    n: n,
    stream: stream,
    presencePenalty: presence_penalty,
    frequencyPenalty: frequency_penalty,
    logitBias: logit_bias,
  };

  const identity = user || organization ? { user, organization } : undefined;

  return new AIGenerateTextTraceStepBuilder()
    .setRequest(
      new GenerateTextRequestBuilder()
        .setGenerateStep(prompt, modelConfig, modelInfo)
        .setIdentity(identity)
    )
    .setResponse(
      new GenerateTextResponseBuilder()
        .setModelUsage({
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        })
        .setResults(
          response.choices.map((choice) => ({
            text: choice.text,
            id: response.id,
            finishReason: choice.finish_reason,
          }))
        )
    );
};

export const generateChatTraceOpenAI = (
  request: Readonly<OpenAIChatGenerateRequest>,
  response?: Readonly<OpenAIChatGenerateResponse>
): AIGenerateTextTraceStepBuilder => {
  const {
    model,
    messages,
    functions,
    function_call,
    max_tokens,
    temperature,
    top_p,
    n,
    stream,
    presence_penalty,
    frequency_penalty,
    logit_bias,
    user,
    organization,
  } = request;

  // Fetching model info
  const mi = modelInfoOpenAI.find((item) => item.name === model);
  const modelInfo = { ...mi, name: model, provider: 'openai' };

  // Building the prompt string from messages array
  const chatPrompt = messages.map(
    ({ content: text, role, name, function_call: functionCall }) => ({
      text,
      role,
      name,
      functionCall,
    })
  );

  // Configure GenerateTextModel based on OpenAIChatGenerateRequest
  const modelConfig: GenerateTextModelConfig = {
    maxTokens: max_tokens,
    temperature: temperature,
    topP: top_p,
    n: n,
    stream: stream,
    presencePenalty: presence_penalty,
    frequencyPenalty: frequency_penalty,
    logitBias: logit_bias,
  };

  const modelUsage = response
    ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : undefined;

  const results = response
    ? response.choices.map((choice) => ({
        id: response.id,
        text: choice.message.content,
        role: choice.message.role,
        finishReason: choice.finish_reason,
      }))
    : undefined;

  const identity = user || organization ? { user, organization } : undefined;

  return new AIGenerateTextTraceStepBuilder()
    .setRequest(
      new GenerateTextRequestBuilder()
        .setGenerateChatStep(chatPrompt, modelConfig, modelInfo)
        .setFunctions(functions)
        .setFunctionCall(function_call as string)
        .setIdentity(identity)
    )
    .setResponse(
      new GenerateTextResponseBuilder()
        .setModelUsage(modelUsage)
        .setResults(results)
        .setRemoteId(response?.id)
    );
};