import env from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Modèles valides selon la clé API actuelle
const MODELS_FALLBACK = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;

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
  const prompt = `Tu es un rédacteur marketing spécialisé dans les petites entreprises et prestataires de services en Afrique francophone (Cameroun).

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication, sans backticks.

Format strict attendu:
{
  "titre": string,
  "description": string,
  "category": string,
  "services": string[],
  "openingHours": [{"day": "MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT"|"SUN", "open": "HH:mm", "close": "HH:mm", "closed": false}] | [],
  "keywords": string[]
}

Consignes:
- Titre accrocheur, clair et optimisé pour le référencement local
- Description marketing longue (80-150 mots minimum). Mets en avant les bénéfices client, l'expérience, la qualité, la zone d'intervention si mentionnée, et un appel à l'action naturel
- Catégorie la plus pertinente parmi : RESTAURANT, COIFFURE_BEAUTE, SANTE, COMMERCE, TRANSPORT, EDUCATION_FORMATION, HOTELLERIE_TOURISME, EVENEMENTIEL, IMMOBILIER, SERVICES_PROFESSIONNELS, AGRICULTURE, AUTRE
- Services: 3 à 6 services concrets et vendeurs (évite les termes vagues)
- Horaires: si le sujet précise des horaires/jours/ouvertures/fermetures, propose des créneaux réalistes. Sinon laisse un tableau vide []
- Si le sujet mentionne des mots-clés, intègre-les naturellement

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
