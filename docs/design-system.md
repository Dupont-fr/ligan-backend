# Design System — LIGAN+

Le design system est la **source unique** des styles. Aucun écran ne doit inventer un style
ad hoc : toute page réutilise les composants de `frontend/src/components/ui/`.

## Tokens

Les tokens vivent dans `frontend/src/styles/tokens.css`, déclinés en **thème clair** (`:root`)
et **thème sombre** (`.dark`). Ils sont exposés à Tailwind via le bloc `@theme` dans
`frontend/src/index.css` (les utilitaires générés utilisent `var(--color-*)`, ce qui permet au
thème sombre de basculer automatiquement).

### Couleurs de marque

- `--color-primary` (#4f46e5 / #818cf8 sombre) — actions principales
- `--color-primary-hover`, `--color-primary-light`
- `--color-secondary` (#06b6d4 / #22d3ee sombre), `--color-secondary-light`

### Fond / texte

- `--color-background` (fond général) · `--color-surface` (cartes, modales — jamais de blanc en dur)
- `--color-text-primary` · `--color-text-secondary` · `--color-text-muted`

### États sémantiques

- `--color-success(+light)` `--color-error(+light)` `--color-warning(+light)` `--color-info(+light)`

### Bordures / ombres / rayons

- `--color-border`, `--color-border-light` — bordures toujours très légères
- `--shadow-sm/md/lg` — ombres discrètes uniquement
- `--radius-sm/md/lg/full` — `--radius-md` par défaut sur cartes/boutons

### Règles

1. Interdiction des couleurs en dur (`bg-white`, `text-black`, `#hex`…) dans les composants.
2. Chaque composant est validé en thème clair **et** sombre.
3. Les photos/logos des professionnels restent inchangés entre les deux thèmes.

## Thème clair / sombre

- Gestion : classe `.dark` sur `<html>` + attribut `data-theme`.
- `frontend/src/lib/theme.ts` : détection `prefers-color-scheme`, choix manuel persistant
  (`localStorage['ligan-theme']`), bascule instantanée.
- `components/shared/ThemeToggle.tsx` : cycle `system → light → dark`.

## Typographie

Police système par défaut. Échelle : xs(12) → sm(14) → base(16) → lg(18) → xl(20) →
2xl(24) → 3xl(30) → 4xl(36). Titres de page : 2xl/3xl + font-semibold/bold.
Texte secondaire : `text-sm` + `--color-text-secondary`.

## Espacements

Multiples de 4px : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

## Composants du design system

| Composant | État |
| --- | --- |
| `Button` (primary/secondary/outline/ghost/danger ; sm/md/lg ; loading/disabled) | ✅ Sprint 0 |
| `Card` | ✅ Sprint 0 |
| `Badge` (success/warning/error/info/neutral/secondary) | ✅ Sprint 0 |
| Input, Select, Textarea | À venir (Sprint 1+) |
| Modal, Toast, Skeleton, EmptyState, Pagination, Header/Sidebar | À venir |

## Breakpoints (responsive)

Mobile-first. Échelle couverte : 320, 375, 390, 414, 480 (smartphone) · 768, 834, 1024
(tablette) · 1280, 1440 (laptop/desktop) · 1920, 2560 (grand écran). Sur ≥ 1920 px, contenu
contraint dans un conteneur `max-width` lisible.