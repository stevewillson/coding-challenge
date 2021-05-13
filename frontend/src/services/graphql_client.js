// docs: https://github.com/spore-gg/frontend-shared/blob/master/services/graphql_client.md
import * as _ from 'lodash-es'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'
// get consistent hash from stringified results
import stringify from 'json-stable-stringify'
import uuid from 'uuid'

export default class GraphqlClient {
  constructor ({ api, cache = {}, ioEmit, io, isServerSide, allowInvalidation = true }) {
    this.api = api
    this.ioEmit = ioEmit
    this.io = io
    this.isServerSide = isServerSide
    this.allowInvalidation = allowInvalidation
    this.synchronousCache = cache

    this._cache = {}
    this._batchQueue = []
    this._listeners = {}
    this._consumeTimeout = null
    // used to prevent duplicated client-side increments
    this.connectionId = uuid.v4()

    this.dataCacheStreams = new Rx.ReplaySubject(1)
    this.dataCacheStreams.next(Rx.of(cache))
    this.dataCacheStream = this.dataCacheStreams.pipe(rx.switchAll())
    // simulataneous invalidateAlls seem to break streams
    this.invalidateAll = _.debounce(this._invalidateAll, 0, { trailing: true })

    this.io.on('reconnect', () => this.invalidateAll(true))

    _.forEach(cache, (result, key) => {
      if (result.shouldRefetchAfterSsr) {
        this._cache[key] = { rawData: result.value }
      } else {
        this._cacheSet(key, { dataStream: Rx.of(result.value) })
      }
    })
  }

  disableInvalidation = () => {
    this.allowInvalidation = false
  }

  enableInvalidation = () => {
    this.allowInvalidation = true
  }

  // for ssr since it's synchronous 1 render atm (can't use getCacheStream)
  setSynchronousCache = (synchronousCache) => { this.synchronousCache = synchronousCache }
  getSynchronousCache = () => { return this.synchronousCache }

  _updateDataCacheStream = () => {
    const dataStreamsArray = _.map(this._cache, ({ dataStream, shouldRefetchAfterSsr }, key) =>
      dataStream
        ? dataStream.pipe(rx.map(value => ({ key, value, shouldRefetchAfterSsr })))
        : Rx.of({ key, value: undefined })
    )
    const stream = Rx.combineLatest(dataStreamsArray)
      .pipe(
        rx.map((datas) => {
          return _.reduce(datas, (cache, data) => {
            // ignore if the request hasn't finished yet (esp for server-side render)
            // don't use null since some reqs return null
            const { key, value, shouldRefetchAfterSsr } = data
            if (value !== undefined) {
              cache[key] = { value, shouldRefetchAfterSsr }
            }
            return cache
          }, {})
        })
      )

    return this.dataCacheStreams.next(stream)
  }

  getCacheStream = () => { return this.dataCacheStream }

  _cacheSet (key, { combinedStream, dataStream, rawData, options }) {
    let combinedStreams, dataStreams
    const valueToCache = options?.ignoreCache ? {} : this._cache[key] || {}
    valueToCache.shouldRefetchAfterSsr = options?.shouldRefetchAfterSsr
    if (dataStream && !valueToCache?.dataStream) {
      // https://github.com/claydotio/exoid/commit/fc26eb830910b6567d50e15063ec7544e2ccfedc
      dataStreams = this.isServerSide
        ? new Rx.BehaviorSubject(Rx.of(undefined))
        : new Rx.ReplaySubject(1)
      valueToCache.dataStreams = dataStreams
      if (rawData) {
        // cache actual value for synchronous subscribe (obs startWith)
        // prevents double render since state can start w/ actual value
        valueToCache.rawData = rawData
      }
      valueToCache.dataStream = dataStreams.pipe(
        rx.switchAll(),
        rx.tap((rawData) => { valueToCache.rawData = rawData })
      )
    }

    if (combinedStream && !valueToCache?.combinedStream) {
      combinedStreams = new Rx.ReplaySubject(1)
      valueToCache.options = options
      valueToCache.combinedStreams = combinedStreams
      valueToCache.combinedStream = combinedStreams.pipe(rx.switchAll())
    }

    if (dataStream) {
      valueToCache.dataStreams.next(dataStream)
    }

    if (combinedStream) {
      valueToCache.combinedStreams.next(combinedStream)
    }

    if (!options?.ignoreCache) {
      this._cache[key] = valueToCache
      this._updateDataCacheStream()
    }

    return valueToCache
  }

  _batchRequest = (req, { isErrorable, isStreamed, streamId = uuid.v4() } = {}) => {
    if (!this._consumeTimeout) {
      this._consumeTimeout = setTimeout(this._consumeBatchQueue)
    }

    const res = new Rx.AsyncSubject()
    this._batchQueue.push({ req, res, isErrorable, isStreamed, streamId })
    return res
  }

  _consumeBatchQueue = () => {
    const queue = this._batchQueue
    this._batchQueue = []
    this._consumeTimeout = null

    const onBatch = (responses) => {
      _.forEach(responses, ({ result, error }, streamId) => {
        const queueIndex = _.findIndex(queue, { streamId })
        if (queueIndex === -1) {
          console.log('stream ignored', streamId)
          return
        }
        const { res, isErrorable } = queue[queueIndex]
        // console.log '-----------'
        // console.log req.path, req.body, req.query, Date.now() - start
        // console.log '-----------'
        queue.splice(queueIndex, 1)
        if (_.isEmpty(queue)) {
          this.io.off(batchId, onBatch)
        }

        if (isErrorable && (error != null)) {
          res.error(error)
          res.complete()
        } else if (error == null) {
          res.next(result)
          res.complete()
        } else {
          console.error('ignored error', error)
        }
      })
    }

    const onSuccess = (response) => {
      if (response.isError) {
        onError(response.info)
      } else {
        onBatch(response)
      }
    }
    const onError = (error) =>
      _.map(queue, ({ res, isErrorable }) => {
        if (isErrorable) {
          return res.error(error)
        } else {
          return console.error(error)
        }
      })

    var batchId = uuid.v4()
    this.io.on(batchId, onSuccess, onError)

    return this.ioEmit('graphqlClient', {
      connectionId: this.connectionId,
      batchId,
      requests: _.map(queue, ({ req, streamId, isStreamed }) => ({
        streamId, path: req.path, body: req.body, isStreamed
      }))
    })
  }

  _combinedRequestStream = (req, options = {}) => {
    const { streamId, clientChangesStream } = options

    this._listeners[streamId] = this._listeners[streamId] || {}

    const initialDataStream = this._initialDataRequest(req, options)
    const additionalDataStream = streamId && options.isStreamed &&
      this._replaySubjectFromIo(this.io, streamId)
    const changesStream = additionalDataStream && clientChangesStream
      ? Rx.merge(additionalDataStream, clientChangesStream)
      : additionalDataStream || clientChangesStream

    if (!changesStream) {
      return initialDataStream
    }

    // ideally we'd use concat here instead, but initialDataStream is
    // a switch observable because of cache
    const combinedStream = Rx.merge(initialDataStream, changesStream).pipe(
      rx.scan((currentValue, update) => {
        // TODO: sometimes a change comes in before initialData (need to figure
        // out why) when changing pages. this & the filter counters that
        if (update?.changes && !currentValue) {
          return null
        }
        return this._combineChanges({
          connectionId: update.connectionId,
          currentValue,
          initial: update?.changes ? null : update,
          changes: update?.changes
        }, options)
      }, null),
      rx.filter((res) => res),
      rx.shareReplay(1)
    )

    // if stream gets to 0 subscribers, the next subscriber starts over
    // from scratch and we lose all the progress of the .scan.
    // This is because publishReplay().refCount() (and any subject)
    // will disconnect when it
    // 2/17/2021 this is not needed anymore after switching to shareReplay
    // this._listeners[streamId].combinedDisposable = combinedStream.subscribe(() => null)

    return combinedStream
  }

  // accept changes from socket emit (new node, deleted node, etc...)
  _combineChanges = ({ connectionId, currentValue, initial, changes }, options) => {
    const {
      initialSortFn, limit, shouldPrependNewUpdates,
      ignoreIncrementsFromMe, ignoreNewStreams
    } = options
    let newValue
    if (initial) {
      newValue = _.cloneDeep(initial)
      if (_.isArray(newValue) && initialSortFn) {
        newValue = initialSortFn(newValue)
      }
    } else if (changes) {
      console.log('changes', changes)
      // FIXME: figure out double changes
      // console.log('changes', changes)
      newValue = _.defaults({
        data: _.mapValues(currentValue.data, (data) => {
          const currentNodes = data.nodes || []
          let newNodes = _.cloneDeep(currentNodes)
          _.forEach(changes, (change) => {
            let existingIndex = -1
            if (['update', 'delete', 'incrementChildren', 'updateChildren', 'updateChild'].includes(change.action)) {
              existingIndex = _.findIndex(currentNodes, { id: change.oldId })
            }

            // if client already added this id, update instead
            if (change.action === 'create') {
              existingIndex = _.findIndex(currentNodes, { clientId: change.newVal?.clientId })
              if (existingIndex !== -1) {
                change.action = 'update'
              }
            }

            if (change.action === 'delete' && change.clientId) {
              existingIndex = _.findIndex(currentNodes, { clientId: change.clientId })
            }

            const isFromMe = connectionId === this.connectionId
            // used for updating reactions
            if (change.action === 'incrementChildren' && existingIndex !== -1 && (!isFromMe || !ignoreIncrementsFromMe)) {
              const existingChildren = newNodes[existingIndex][change.childKey]
              _.forEach(change.children, (child) => {
                const existingChildIndex = _.findIndex(existingChildren, _.omit(child, 'count'))
                if (existingChildIndex !== -1) {
                  newNodes[existingIndex][change.childKey][existingChildIndex].count += child.count
                } else {
                  newNodes[existingIndex][change.childKey] = existingChildren.concat(child)
                }
              })
            } else if (change.action === 'updateChild' && existingIndex !== -1 && (!isFromMe || !ignoreIncrementsFromMe)) {
              newNodes[existingIndex][change.childKey] = change.newChildValue
            } else if (change.action === 'updateChildren' && existingIndex !== -1 && (!isFromMe || !ignoreIncrementsFromMe)) {
              const existingChildren = newNodes[existingIndex][change.childKey]
              _.forEach(change.children, (child) => {
                const existingChildIndex = _.findIndex(existingChildren, child.find)
                if (existingChildIndex !== -1) {
                  newNodes[existingIndex][change.childKey][existingChildIndex] = _.defaults(
                    child.replace,
                    newNodes[existingIndex][change.childKey][existingChildIndex]
                  )
                } else {
                  newNodes[existingIndex][change.childKey] = existingChildren.concat(
                    _.defaults(child.replace, child.find)
                  )
                }
              })

            // update existing value
            } else if (change.action === 'update' && existingIndex !== -1) {
              newNodes.splice(existingIndex, 1, change.newVal)

            // rm existing value
            } else if (change.action === 'delete' && existingIndex !== -1) {
              newNodes.splice(existingIndex, 1)

            // add new value
            } else if (change.action === 'create' && !ignoreNewStreams) {
              if (shouldPrependNewUpdates) {
                newNodes = [change.newVal].concat(currentNodes)
                if (limit && newNodes.length > limit) {
                  newNodes.pop()
                }
              } else {
                newNodes = currentNodes.concat([change.newVal])
                if (limit && newNodes.length > limit) {
                  newNodes.shift()
                }
              }
            }
          })
          return _.defaults({ nodes: newNodes }, data)
        })
      }, currentValue)
    }

    return newValue
  }

  _replaySubjectFromIo = (io, eventName) => {
    let replaySubject
    if (!this._listeners[eventName].replaySubject) {
      // console.log('new listener')
      replaySubject = new Rx.ReplaySubject(0)
      const ioListener = (data) => replaySubject.next(data)
      io.on(eventName, ioListener)
      this._listeners[eventName].replaySubject = replaySubject
      this._listeners[eventName].ioListener = ioListener
    }
    return this._listeners[eventName].replaySubject
  }

  _streamFromIo (io, eventName) {
    return new Rx.Observable(observer => {
      io.on(eventName, (data) => observer.next(data))
      return () => io.off(eventName)
    })
  }

  _initialDataRequest = (req, { isErrorable, streamId, ignoreCache, isStreamed }) => {
    const key = stringify(req)
    let cachedValue = this._cache[key]

    if (!cachedValue?.dataStream || ignoreCache) {
      // should only be caching the actual async result and nothing more, since
      // that's all we can really get from server -> client rendering with
      // json.stringify
      cachedValue = this._cacheSet(key, {
        dataStream: this._batchRequest(req, { isErrorable, streamId, isStreamed }),
        options: { ignoreCache }
      })
    }

    return cachedValue.dataStream
  }

  setDataCache = (req, data) => {
    const key = typeof req === 'string' ? req : stringify(req)
    return this._cacheSet(key, { dataStream: Rx.of(data) })
  }

  getCachedStream = (path, body, isErrorable) => {
    const req = { path, body, isErrorable: Boolean(isErrorable) }
    const key = stringify(req)

    if (this._cache[key]?.dataStream) {
      return this._cache[key].dataStream
    } else {
      return Rx.of(null)
    }
  }

  stream = (path, body, options = {}) => {
    // we don't want parents that have isErrorable: false to use the same
    // stream as those with isErrorable: true, so that's added to the cache key
    const req = { path, body, isErrorable: Boolean(options.isErrorable) }
    const key = stringify(req)

    let cachedValue = this._cache[key]
    const cachedValueRawData = this._cache[key]?.rawData

    if (!cachedValue?.combinedStream || options.ignoreCache) {
      const streamId = uuid.v4()
      options = _.defaults(options, {
        streamId,
        isErrorable: false
      })
      const { clientChangesStream } = options
      options.clientChangesStream = clientChangesStream?.pipe(
        rx.filter(_.identity), // initially and on validation this is set to null, which is filtered out here
        rx.map((change) => {
          return {
            initial: null,
            changes: [change],
            isClient: true
          }
        }),
        rx.share()
      )

      cachedValue = this._cacheSet(key, {
        options,
        combinedStream: this._combinedRequestStream(req, options)
      })
    }

    return cachedValueRawData
      ? cachedValue?.combinedStream
        .pipe(
          // start with actual value to prevent 2 renders (basically makes subscribing to the obs synchronous)
          rx.startWith(cachedValueRawData)
        )
      : cachedValue?.combinedStream
  }

  call = async (path, body, { additionalDataStream } = {}) => {
    const req = { path, body }

    const streamId = uuid.v4()

    if (additionalDataStream) {
      additionalDataStream.next(this._streamFromIo(this.io, streamId))
    }

    const stream = this._batchRequest(req, { isErrorable: true, streamId })

    const result = await stream.pipe(rx.take(1)).toPromise()
    if (result?.error && (typeof window !== 'undefined' && window !== null)) {
      throw new Error(JSON.stringify(result?.error))
    }
    return result
  }

  disposeAll = () => {
    _.map(this._listeners, (listener, streamId) => {
      this.io.off(streamId, listener?.ioListener)
      // listener.combinedDisposable?.unsubscribe()
    })
    this._listeners = {}
  }

  // deobunced in constructor
  // clear cache for all requests (refetch all)
  _invalidateAll = (streamsOnly = false) => {
    if (!this.allowInvalidation) {
      return
    }

    this.disposeAll()

    if (streamsOnly) {
      this._cache = _.pickBy(this._cache, (cache, key) => cache.options?.isStreamed)
    }

    this._cache = _.pickBy(_.mapValues(this._cache, (cache, key) => {
      const { dataStreams, combinedStreams, options } = cache

      if (options?.persistThroughInvalidateAll) {
        return cache
      }

      // without this, after invalidating, the stream is just the clientChanges
      // for a split second (eg chat just shows the messages you
      // posted for a flash until the rest reload in). this is kind of hacky
      // since it's a prop on the object, the observable gets completed replaced
      // in the model too

      if (options?.clientChangesStream) {
        console.log('clear stream')
        options.clientChangesStream.next(null)
      }

      if (!combinedStreams || (combinedStreams.observers.length === 0)) {
        return false
      }
      const req = JSON.parse(key)
      delete cache.rawData
      dataStreams.next(this._batchRequest(req, options))
      combinedStreams.next(this._combinedRequestStream(req, options))
      return cache
    }), (val) => val)
    return null
  }

  // clear cache for single request (refetch)
  invalidate = (path, body, isErrorable) => {
    if (!this.allowInvalidation) {
      return
    }

    // console.log('Invalidating single', body)

    let req = { path, body, isErrorable: Boolean(isErrorable) }
    const key = stringify(req)

    _.map(this._cache, (cache, cacheKey) => {
      const { dataStreams, combinedStreams, options } = cache
      req = JSON.parse(cacheKey)

      if ((req.path === path && _.isUndefined(body)) || cacheKey === key) {
        // console.log('found invalidation')
        // const listener = this._listeners[options.streamId]
        // listener.combinedDisposable?.unsubscribe()
        delete this._listeners[options.streamId]
        this.io.off(options.streamId)

        dataStreams.next(this._batchRequest(req, options))
        combinedStreams.next(this._combinedRequestStream(req, options))
      }
    })

    return null
  }
}
