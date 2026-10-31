import env from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Modèles valides au 31/10/2026 - 2.0-flash est arrêté depuis le 01/06/2026
const MODELS_FALLBACK = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;

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
      throw new Error(`Gemini ${res.status} [${model}]: ${txt.slice(0, 500)}`);
    }

    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    if (!text.trim()) throw new Error(`Réponse vide de ${model}`);
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

  let lastError: unknown = null;

  for (const model of MODELS_FALLBACK) {
    try {
      const raw = await callGemini(prompt, model);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      lastError = err;
      logger.error(`Échec avec ${model}: ${err instanceof Error ? err.message : err}`);
      // Ne pas réessayer sur erreur de clé manquante
      if (err instanceof Error && err.message.includes('AI_API_KEY')) throw err;
    }
  }

  logger.error(
    `Échec génération/parsing Gemini: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
  throw new Error(lastError instanceof Error ? lastError.message : 'Réponse IA invalide');
}
