import ApolloFederation from '@apollo/federation'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { Schema } from '../lib/index.js'

const { buildFederatedSchema } = ApolloFederation

// dir above where all the graphql stuff is in
const __dirname = dirname(dirname(fileURLToPath(import.meta.url)))

export let globalSchema
export const schemaPromise = Schema.getSchema({ dirName: __dirname }).then((schema) => {
  globalSchema = buildFederatedSchema(schema)
  // https://github.com/apollographql/apollo-feature-requests/issues/145
  // SchemaDirectiveVisitor.visitSchemaDirectives(globalSchema)
})
