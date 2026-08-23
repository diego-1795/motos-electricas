## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Proyecto Raiden — convenciones

- Lee `/docs/01-architecture.md` y el rol correspondiente en `/agents/*.md` antes de tocar código.
- Capas: `src/domain` (puro) → `src/services` → `src/data` (repositorios) → `src/components|islands|pages`. Nada de lógica de negocio en componentes.
- Config centralizada en `src/config/site.ts`. Nunca hardcodear el número de WhatsApp ni la marca.
- Mensajes de WhatsApp SOLO vía `src/services/whatsapp/WhatsAppMessageBuilder.ts`.
- Islas Preact solo cuando hay interacción real; el resto es HTML estático.
- Estilos: tokens en `src/styles/tokens.css`; sin Tailwind ni librerías UI.
- Contenido: JSON/MD en `src/content/*` validado por `src/content.config.ts`.
- Decisiones nuevas → ADR en `docs/21-decisions.md`.
- Verifica siempre: `npm run check && npm run build && npm test`.
