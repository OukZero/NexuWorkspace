# Skills de Claude Code instaladas

Son ayudas de desarrollo para Claude Code; la app no las necesita en ejecución.
Viven en `.claude/skills/` y sus versiones exactas en `skills-lock.json`.

| Skill | Para qué sirve | Origen |
| --- | --- | --- |
| `animation-performance` | Mantener las animaciones dentro del presupuesto de frame | `emilkowalski/skills` |
| `break-ui` | Probar una UI con datos extremos (nombres largos, vacío, miles de ítems) | `emilkowalski/skills` |
| `disney-animation-rule-skill` | Los 12 principios de Disney aplicados a animación procedural | `vibe-motion/skills` |
| `emil-design-eng` | Pulido de interacciones y detalles de diseño | `emilkowalski/skills` |
| `find-animation-opportunities` | Detectar dónde falta animación (solo lectura) | `emilkowalski/skills` |
| `improve-animations` | Auditoría de movimiento y planes de mejora | `emilkowalski/skills` |
| `review-animations` | Revisar animaciones de un cambio | `emilkowalski/skills` |
| `find-skills` | Buscar e instalar skills nuevas (solo en `.agents/`, no versionada) | `vercel-labs/skills` |

## Reinstalar

```bash
npx skills add emilkowalski/skills
npx skills add vibe-motion/skills@disney-animation-rule-skill
npx skills add vercel-labs/skills@find-skills
```

`npx skills add` también crea carpetas de otros agentes (`.adal/`, `.zencoder/`, `skills/`, `data/`…);
están en `.gitignore` y se pueden borrar sin problema.
