// POST /sync  { since?: number, changes?: [{ key, updatedAt, deleted?, data? }] }
// -> { changes: [registros del usuario con updatedAt > since], rejected: [claves que ya tenian una version mas nueva], serverTime }
// El userId sale SIEMPRE del token validado por API Gateway (claim "sub"), nunca del cuerpo de la peticion.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
const TABLE = process.env.TABLE_NAME
const KEY_RE = /^(task|entry|group|settings)#[\w.-]{1,64}$/
const MAX_CHANGES = 100
const MAX_ITEM_BYTES = 300_000 // DynamoDB admite 400 KB por item

const reply = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const handler = async (event) => {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub
  if (!userId) return reply(401, { error: 'Sin identidad' })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return reply(400, { error: 'JSON invalido' })
  }
  const changes = Array.isArray(body.changes) ? body.changes : []
  if (changes.length > MAX_CHANGES) return reply(400, { error: `Maximo ${MAX_CHANGES} cambios por peticion` })
  const since = Number.isFinite(body.since) ? body.since : 0

  const rejected = []
  for (const c of changes) {
    if (typeof c?.key !== 'string' || !KEY_RE.test(c.key) || !Number.isFinite(c.updatedAt)) return reply(400, { error: 'Cambio invalido' })
    const data = c.deleted ? null : (c.data ?? null)
    if (JSON.stringify(data).length > MAX_ITEM_BYTES) return reply(400, { error: `Registro demasiado grande: ${c.key}` })
    try {
      // gana la ultima modificacion: solo se escribe si es mas nueva que la guardada
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: { userId, recordKey: c.key, updatedAt: c.updatedAt, deleted: !!c.deleted, data },
          ConditionExpression: 'attribute_not_exists(recordKey) OR updatedAt < :u',
          ExpressionAttributeValues: { ':u': c.updatedAt }
        })
      )
    } catch (e) {
      if (e?.name === 'ConditionalCheckFailedException') rejected.push(c.key)
      else throw e
    }
  }

  const out = []
  let lastKey
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'byUpdated',
        KeyConditionExpression: 'userId = :u AND updatedAt > :s',
        ExpressionAttributeValues: { ':u': userId, ':s': since },
        ExclusiveStartKey: lastKey
      })
    )
    for (const it of r.Items ?? []) out.push({ key: it.recordKey, updatedAt: it.updatedAt, deleted: !!it.deleted, data: it.data })
    lastKey = r.LastEvaluatedKey
  } while (lastKey)

  return reply(200, { changes: out, rejected, serverTime: Date.now() })
}
