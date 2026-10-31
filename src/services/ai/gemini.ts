import env from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function callGemini(prompt: string, model = 'gemini-2.5-flash'): Promise<string> {
  const key = process.env.AI_API_KEY || (env as any).ai?.apiKey;
  if (!key) throw new Error('AI_API_KEY manquante');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${txt.slice(0, 150)}`);
    }

    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    return String(text).trim();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error("Délai d'attente dépassé lors de la génération IA");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateActivityFromPrompt(sujet: string) {
  const prompt = `Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication.
Format: {"titre": string, "description": string, "services": string[]}
Sujet: ${sujet}`;

  try {
    const raw = await callGemini(prompt, 'gemini-2.5-flash');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err1) {
    try {
      const raw = await callGemini(prompt, 'gemini-2.5-flash-lite');
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err2) {
      try {
        const raw = await callGemini(prompt, 'gemini-2.0-flash');
        const cleaned = raw.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
      } catch (err) {
        logger.error(`Échec génération/parsing Gemini: ${err instanceof Error ? err.message : err}`);
        throw new Error(err instanceof Error ? err.message : 'Réponse IA invalide');
      }
    }
  }
}
