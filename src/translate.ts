const URL = "https://api.openai.com/v1/chat/completions"
const MODEL = "gpt-5.4-mini"

const SYSTEM = `You are a translator across three languages: Chinese (zh), Vietnamese (vi), and English (en).
Identify the source language of the input and produce faithful, natural translations in all three languages.
Reply with strict JSON: {"source":"zh|vi|en","zh":"...","vi":"...","en":"..."}.
The field whose key matches "source" must equal the input verbatim.`

export type Lang = "zh" | "vi" | "en"
export type Triple = { source: Lang; zh: string; vi: string; en: string }

export async function translate(apiKey: string, text: string): Promise<Triple> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`translate failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? ""
  const parsed = JSON.parse(content)
  const { source, zh, vi, en } = parsed
  if (source !== "zh" && source !== "vi" && source !== "en") {
    throw new Error(`bad source: ${source}`)
  }
  if (typeof zh !== "string" || typeof vi !== "string" || typeof en !== "string") {
    throw new Error("missing translation fields")
  }
  return { source, zh, vi, en }
}
