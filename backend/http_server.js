import ApolloServerExpress from 'apollo-server-express'
import ApolloFederation from '@apollo/federation'
import GraphQLTools from '@graphql-tools/utils'
import fs from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { Schema } from './lib/index.js'

const { ApolloServer } = ApolloServerExpress
const { buildFederatedSchema } = ApolloFederation
const { SchemaDirectiveVisitor } = GraphQLTools
const __dirname = dirname(fileURLToPath(import.meta.url))

const schemaPromise = Schema.getSchema({ dirName: __dirname })

export function listenHttp (app) {
  schemaPromise.then((schema) => {
    const { typeDefs, resolvers, schemaDirectives } = schema
    schema = buildFederatedSchema({ typeDefs, resolvers })
    // https://github.com/apollographql/apollo-feature-requests/issues/145
    SchemaDirectiveVisitor.visitSchemaDirectives(schema, schemaDirectives)

    const graphqlServer = new ApolloServer({
      schema
    })
    graphqlServer.applyMiddleware({ app, path: '/graphql' })
  })
}
