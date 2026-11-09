# Login con AWS Cognito: desactivado temporalmente

**Estado:** el código del login (etapa 1) y la infraestructura (`infra/`) están en el repositorio, pero el login está **desactivado** hasta que haya acceso a una cuenta de AWS. Con el login desactivado la app funciona exactamente como antes: sin pantalla de acceso y sin llamadas a AWS.

## Cómo está desactivado
Un solo interruptor en `resources/auth.config.json`:

```json
{ "enabled": false, ... }
```

- `src/main/auth.ts` (`initAuth`): si `enabled` no es `true`, marca la sesión como válida (`disabled: true`) y no contacta con Cognito.
- No se ha borrado ni comentado código: el guard del IPC (`ipc.ts`), el arranque condicionado (`index.ts`), `Login.tsx`, el preload y los tipos siguen ahí y no hacen nada mientras el interruptor esté apagado.
- La sección «Cuenta / Cerrar sesión» de Ajustes se oculta.

## Cómo reactivarlo
1. Despliega la infraestructura siguiendo `infra/README.md` (`sam validate --lint`, `sam build`, `sam deploy --guided`).
2. Copia los Outputs (`Region`, `UserPoolId`, `ClientId`, `ApiUrl`) a `resources/auth.config.json`.
3. Cambia `"enabled"` a `true`.
4. Crea tu usuario con `aws cognito-idp admin-create-user ...` (ver `infra/README.md`) y prueba con `npm run dev`.

Para probar sin editar el archivo: variable de entorno `SHUTOKI_AUTH=on` (junto con las `SHUTOKI_COGNITO_*`).

## Pendiente mientras esté desactivado
- La plantilla `infra/template.yaml` **no se ha validado** (no había SAM CLI) ni desplegado, y el flujo de login nunca se ejecutó contra Cognito real.
- Criterios de aceptación de la etapa 1 sin verificar: sin sesión no se puede usar la app, usuario desactivado no puede volver a entrar, funcionamiento sin internet.
- La etapa 2 (sincronización) no se ha empezado.
- **No publiques un instalador con `enabled: false` creyendo que protege el acceso**: la app queda abierta.
