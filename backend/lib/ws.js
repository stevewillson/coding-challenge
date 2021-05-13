// docs: https://github.com/spore-gg/frontend-shared/blob/master/services/graphql_client.md
import _ from 'lodash'
import Promise from 'bluebird'

var thrower = function ({ status, info, ttlSeconds, ignoreLog }) {
  if (status == null) { status = 400 }

  const error = new Error(info)
  Error.captureStackTrace(error, thrower)

  error.status = status
  error.info = info
  error.ttlSeconds = ttlSeconds
  error.ignoreLog = ignoreLog
  error._ws = true

  throw error
}

const BATCH_CHUNK_TIMEOUT_MS = 30
const BATCH_CHUNK_TIMEOUT_BACKOFF_MS = 50
const MAX_BATCH_CHUNK_TIMEOUT_MS = 15000

class WS {
  static initClass () {
    this.prototype.throw = thrower
  }

  constructor (state = {}) {
    this.bind = this.bind.bind(this)
    this.on = this.on.bind(this)
    this.resolve = this.resolve.bind(this)
    this.setMiddleware = this.setMiddleware.bind(this)
    this.setDisconnect = this.setDisconnect.bind(this)
    this.onConnection = this.onConnection.bind(this)
    this.state = state
    this.middlewareFn = async (options, req) => req
  }

  bind (transform) {
    return new WS(transform(this.state))
  }

  on (path, handler) {
    return this.bind((state) =>
      _.defaultsDeep({
        paths: { [path]: handler }
      }, state))
  }

  resolve (path, body, req, io) {
    return new Promise(resolve => {
      const handler = this.state.paths[path]

      if (!handler) {
        this.throw({ status: 400, info: `Handler not found for path: ${path}` })
      }

      return resolve(handler(body, req, io))
    }).then(result => ({
      result,
      error: null
    }))
      .catch(function (error) {
        if (!error.ignoreLog) {
          console.error(error)
        }
        const errObj = error._ws
          ? { status: error.status, info: error.info, ttlSeconds: error.ttlSeconds }
          : { status: 500 }

        return { result: null, error: errObj }
      })
  }

  setMiddleware (middlewareFn) { this.middlewareFn = middlewareFn; return null }

  setDisconnect (disconnectFn) { this.disconnectFn = disconnectFn; return null }

  onConnection (socket) {
    socket.on('disconnect', () => {
      return this.disconnectFn?.(socket)
    })

    return socket.on('graphqlClient', (body) => {
      const requests = body?.requests
      let isComplete = false

      const emitBatchChunk = responses => socket.emit(body.batchId, responses)

      let responseChunk = {}
      let timeoutMs = BATCH_CHUNK_TIMEOUT_MS
      var emitBatchChunkFn = function () {
        timeoutMs += BATCH_CHUNK_TIMEOUT_BACKOFF_MS
        if (!_.isEmpty(responseChunk)) {
          emitBatchChunk(responseChunk)
          responseChunk = {}
        }
        if ((timeoutMs < MAX_BATCH_CHUNK_TIMEOUT_MS) && !isComplete) {
          return setTimeout(emitBatchChunkFn, timeoutMs)
        }
      }

      setTimeout(emitBatchChunkFn, timeoutMs)

      return this.middlewareFn(body, socket.request)
        .then(req => {
          return Promise.map(requests, request => {
            const emitResponse = response => socket.emit(request.streamId, response)
            return this.resolve(request.path, request.body, socket.request, {
              emit: emitResponse,
              route: request.path,
              socket,
              connectionId: body.connectionId,
              isStreamed: request.isStreamed
            })
              .then(response => {
                responseChunk[request.streamId] = response
              }).catch(err => console.log('caught ws error', err))
          }).then(() => { isComplete = true })
        }).catch(err => console.log(err))
    })
  }
}
WS.initClass()

export default new WS()
