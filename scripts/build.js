import { createClient } from '@hey-api/openapi-ts'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'

const endpointUrl = process.argv[2] || 'https://localhost:43379/swagger/v1/swagger.json'

if (endpointUrl.includes('https://localhost:')) {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0
}

console.log(`Downloading openAPI schema from: ${endpointUrl}`)

const schema = await fetch(endpointUrl).then((response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI schema: ${response.statusText}`)
  }

  return response.json()
})

console.log(`Trasforming types ...`)

/**
 * Add all the object properties to required so they won't be marked as possibly undefined in the
 * generated types, because there is no undefined value in C# and the C# API won't serailize the
 * object in partial.
 */
function transformObjectSchema(value) {
  if (value.type === 'object' && value.properties) {
    value.required = Object.keys(value.properties)
    return
  }

  if (value.allOf) {
    for (const child of value.allOf) {
      transformObjectSchema(child)
    }
  }

  if (value.oneOf) {
    for (const child of value.oneOf) {
      transformObjectSchema(child)
    }
  }

  if (value.anyOf) {
    for (const child of value.anyOf) {
      transformObjectSchema(child)
    }
  }
}

// clear all the API endpoints because we only need the types
schema.paths = {}

for (const value of Object.values(schema.components.schemas)) {
  try {
    transformObjectSchema(value)
  } catch (error) {
    console.error(`Failed to transform schema: ${JSON.stringify(value)}`)
    console.error(error)
  }
}

const version = schema.info.version

console.log(`Generating types ...`)

await createClient({
  input: schema,
  output: './dist',
  plugins: ['@hey-api/client-fetch'],
})

console.log(`Exporting ...`)

// save it for debugging
await fs.writeFile('./dist/schema.json', JSON.stringify(schema, null, 2))

const writeStream = createWriteStream('./types.gen.ts', { flags: 'w' })

writeStream.write(`// Rumble API version: ${version}\n`)
writeStream.write(`// Generated on: ${new Date()}\n`)

const readStream = createReadStream('./dist/types.gen.ts')
readStream.pipe(writeStream)

await new Promise((resolve, reject) => {
  readStream.on('error', reject);
  writeStream.on('error', reject);
  writeStream.on('finish', resolve);
})
