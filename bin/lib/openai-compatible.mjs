export function getLlmConfig(env = process.env) {
  return {
    apiKey: env.NOVELTIPS_API_KEY ?? "",
    baseUrl: env.NOVELTIPS_BASE_URL ?? "https://api.openai.com/v1",
    model: env.NOVELTIPS_MODEL ?? "gpt-4o-mini"
  };
}

export function buildChatCompletionRequest({ model, messages, temperature = 0.2, responseFormat }) {
  const request = {
    model,
    messages,
    temperature
  };
  if (responseFormat) {
    request.response_format = responseFormat;
  }
  return request;
}

export async function chatCompletion({ apiKey, baseUrl, model, messages, temperature = 0.2, responseFormat }) {
  if (!apiKey) {
    throw new Error("NOVELTIPS_API_KEY is required for LLM calls.");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildChatCompletionRequest({
      model,
      messages,
      temperature,
      responseFormat
    }))
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("LLM response did not contain valid JSON.");
  }
}

