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
  const prompt = `Tu es un copywriter marketing spécialisé dans les TPE/PME et prestataires de services en Afrique francophone (Cameroun).

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication, sans backticks.

Format strict:
{
  "titre": string,
  "description": string,
  "category": string,
  "services": string[],
  "openingHours": [{"day": "MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT"|"SUN", "open": "HH:mm", "close": "HH:mm", "closed": false}] | [],
  "keywords": string[]
}

Règles impératives:
- Titre: court, accrocheur et orienté recherche locale (max 60 caractères)
- Description: OBLIGATOIREMENT entre 120 et 200 mots, à ton marketing. Mets en avant les bénéfices clients, la qualité du service, l'expérience, la zone d'intervention si précisée, les atouts différenciants. Termine par un appel à l'action naturel (ex. "Faites appel à nous pour...")
- Catégorie: choisis UNIQUEMENT la plus pertinente parmi: RESTAURANT, COIFFURE_BEAUTE, SANTE, COMMERCE, TRANSPORT, EDUCATION_FORMATION, HOTELLERIE_TOURISME, EVENEMENTIEL, IMMOBILIER, SERVICES_PROFESSIONNELS, AGRICULTURE, AUTRE
- Services: 4 à 6 services concrets, précis et vendeurs (ex. "Coupe homme + barbe", "Réparation fuites sanitaires"). Évite "Divers", "Autres services".
- Horaires: SI le sujet indique des jours/horaires/ouvertures/fermetures, génère des créneaux réalistes pour CHAQUE jour mentionné. Pour les jours non ouverts, utilise {"closed": true}. Utilise le format 24h HH:mm. Si aucun horaire n'est précisé, renvoie []
- Sois concret, adapté au marché camerounais, évite le blabla générique

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
