import _ from 'lodash'
import socketIO from 'socket.io'
import ApolloServerCore from 'apollo-server-core'
import ApolloRequestPipeline from 'apollo-server-core/dist/requestPipeline.js'
import ApolloGraphQLOptions from 'apollo-server-core/dist/graphqlOptions.js'
import ApolloGatewayAll from '@apollo/gateway'

import { ws, GraphqlFormatter, Stream } from './lib/index.js'
import { schemaPromise, globalSchema } from './services/graphql.js'

const { ApolloServerBase } = ApolloServerCore
const { processGraphQLRequest } = ApolloRequestPipeline
const { resolveGraphqlOptions } = ApolloGraphQLOptions
const { ApolloGateway, LocalGraphQLDataSource, RemoteGraphQLDataSource } = ApolloGatewayAll

class ApolloServer extends ApolloServerBase {
  applyMiddleware (middleware) { return null }
}
// ApolloServer.initClass()

const serverPromise = schemaPromise.then(() => {
  const gateway = new ApolloGateway({
    serviceList: [
      { name: 'zygote', url: 'local' }
    ],
    buildService ({ name, url }) {
      if (name === 'zygote') {
        return new LocalGraphQLDataSource(globalSchema)
      } else {
        return new RemoteGraphQLDataSource({
          url,
          willSendRequest: ({ request, context }) => {
            request.http.headers.set('user', context.user ? JSON.stringify(context.user) : '')
            request.http.headers.set('org', context.org ? JSON.stringify(context.org) : '')
          }
        })
      }
    }
  })

  return new ApolloServer({
    gateway,
    subscriptions: false,
    engine: {
      debugPrintReports: true
    }
  })
})

// server.applyMiddleware {ws}
export let wsServer

export function listenWs (server) {
  wsServer = ws.on('graphql', async function (body, req, { emit, route, socket, connectionId, isStreamed } = {}) {
    const server = await serverPromise
    let options = server.graphQLServerOptions({ req })
    options = await resolveGraphqlOptions(options)

    const request = {
      query: body.query,
      variables: body.variables || {}
    }

    const context = {
      emit,
      route,
      socket,
      connectionId,
      headers: req.headers,
      connection: req.connection,
      user: req.user,
      org: req.org,
      orgUser: req.orgUser,
      file: req.file,
      userAgent: req.userAgent,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      product: req.product,
      isStreamed,
      streamGraphQL: body.streamOptions?.streamGraphQL,
      prepareGraphQL: body.streamOptions?.prepareGraphQL
    }

    const { data, errors } = await GraphqlFormatter.execQuery(request.query, request.variables, context, [], async () => {
      return processGraphQLRequest(options, { request, context })
    })

    if (errors) {
      if (errors?.[0]?.message === 'Unauthorized') {
        console.log('unauth')
      } else {
        console.log(_.map(errors, error => ({
          name: request.query,
          error: error.message,
          exception: JSON.stringify(error.extensions, null, 2)
        })))
      }
      ws.throw({
        status: errors[0].extensions.code,
        info: errors[0].extensions.info,
        ttlSeconds: errors[0].extensions.ttlSeconds
      }) // TODO don't throw if data? send all errors?
    } else {
      // console.log('res', data)
    }
    return { data, errors }
  })

  const io = socketIO.listen(server)
  wsServer.setDisconnect(Stream.wsDisconnect)
  io.on('connection', wsServer.onConnection)
}
