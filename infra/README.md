# Infraestructura AWS de Shutoki AI Workspace

Todo se define en `template.yaml` (AWS SAM) y se despliega con un comando.

| Recurso | Para qué |
| --- | --- |
| Cognito User Pool | Login. **Registro público desactivado**: solo el administrador crea usuarios. |
| App client público | Lo usa la app de escritorio (sin secret; flujos `USER_PASSWORD_AUTH` y refresh). Refresh token 30 días, access token 60 min. |
| DynamoDB `shutoki-sync` | Un item por registro. Clave de partición `userId` (el `sub` de Cognito) y de orden `recordKey` (`task#id`, `entry#id`…). Índice local `byUpdated` para descargar cambios desde una fecha. |
| API Gateway HTTP API + Lambda `shutoki-sync` | `POST /sync` con authorizer JWT de Cognito. La app nunca toca la base ni lleva credenciales de AWS; el `userId` sale del token, no del cuerpo. |

El acceso a datos de otros usuarios es imposible por construcción: la Lambda solo consulta y escribe con el `sub` del token validado.

## Requisitos (una vez)

1. Cuenta de AWS y un usuario IAM con permisos para CloudFormation, Cognito, DynamoDB, Lambda, API Gateway e IAM (para crear el rol de la Lambda). No uses el usuario raíz.
2. [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) y `aws configure` (o `aws configure sso`) con ese usuario.
3. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).
4. Node.js 22 (el mismo runtime de la Lambda).

## Desplegar

```powershell
cd infra
sam validate --lint
sam build
sam deploy --guided --region <tu-region>   # la primera vez; después basta `sam deploy`
```

Elige una región cercana (por ejemplo `us-east-1` o `sa-east-1`). Al terminar, SAM imprime los **Outputs**: `Region`, `UserPoolId`, `ClientId` y `ApiUrl`. Se pueden volver a ver con:

```powershell
aws cloudformation describe-stacks --stack-name shutoki --query "Stacks[0].Outputs"
```

## Conectar la app

Copia los Outputs a `resources/auth.config.json` (no son secretos: identifican el pool, no dan acceso):

```json
{ "region": "us-east-1", "userPoolId": "us-east-1_XXXX", "clientId": "XXXXXXXX", "apiUrl": "https://xxxx.execute-api.us-east-1.amazonaws.com" }
```

Para desarrollo también valen las variables `SHUTOKI_COGNITO_REGION`, `SHUTOKI_COGNITO_USER_POOL_ID`, `SHUTOKI_COGNITO_CLIENT_ID` y `SHUTOKI_API_URL`. Sin Cognito, `SHUTOKI_AUTH=off npm run dev` salta el login (solo funciona con la app sin empaquetar).

## Administrar usuarios

```powershell
$pool = "<UserPoolId>"
# crear (Cognito envía un correo con la contraseña temporal; la app pide cambiarla al primer acceso)
aws cognito-idp admin-create-user --user-pool-id $pool --username persona@correo.com --user-attributes Name=email,Value=persona@correo.com Name=email_verified,Value=true
# desactivar (no podrá volver a entrar cuando expire su sesión; para cortarla ya, además revoca los tokens)
aws cognito-idp admin-disable-user --user-pool-id $pool --username persona@correo.com
aws cognito-idp admin-user-global-sign-out --user-pool-id $pool --username persona@correo.com
# reactivar / eliminar / listar
aws cognito-idp admin-enable-user --user-pool-id $pool --username persona@correo.com
aws cognito-idp admin-delete-user --user-pool-id $pool --username persona@correo.com
aws cognito-idp list-users --user-pool-id $pool
```

La app revalida la sesión al arrancar, al despertar el equipo y cada ~55 minutos. Un usuario desactivado o con sesión revocada vuelve al login en cuanto la revalidación llega a AWS; sin internet la sesión sigue aceptándose hasta que pasen 30 días desde su login.

## Costo (verificar antes de desplegar)

Con menos de 10 usuarios, todo cae en la capa gratuita o en céntimos. Las cuotas cambian: confirma en las páginas de precios de AWS (Cognito, Lambda, DynamoDB, API Gateway) antes de desplegar.

- **Cognito**: la capa gratuita es permanente y se mide en usuarios activos al mes (decenas de miles según el plan); 10 usuarios no se acercan.
- **Lambda** y **DynamoDB** (bajo demanda, cifrado en reposo con clave de AWS): tienen capa gratuita permanente muy superior a este uso.
- **API Gateway HTTP API**: su capa gratuita **dura solo 12 meses** en cuentas nuevas. Después cuesta alrededor de 1 USD por millón de llamadas: con 10 usuarios sincronizando cada minuto son unos pocos cientos de miles al mes como máximo, es decir, **menos de 1 USD al mes**.
- El API tiene un límite de 5 peticiones/s (ráfaga 10) que acota el gasto ante un bucle o abuso.
- Recomendado: crea un **AWS Budget** de 1–5 USD con aviso por correo.

## Seguridad y límites

- Cognito, DynamoDB y el API van por HTTPS; la tabla y el pool tienen `DeletionPolicy: Retain` y el pool, protección contra borrado.
- El login es una barrera de acceso, no una protección fuerte: el código corre en el equipo del usuario.
- `USER_PASSWORD_AUTH` envía la contraseña por TLS a Cognito (no hay secret que proteger en un cliente público). Cambiar a SRP es posible más adelante.
- Los correos de Cognito salen con el remitente por defecto (límite diario bajo, suficiente para invitaciones y recuperación de contraseña).

## Eliminar todo

`sam delete --stack-name shutoki` no borra el User Pool ni la tabla (están en `Retain`); elimínalos a mano en la consola si de verdad quieres perder usuarios y datos.
