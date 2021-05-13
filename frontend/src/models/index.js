import * as _ from 'lodash-es'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'

import Note from './note'
import GraphqlClient from '../services/graphql_client'

const SERIALIZATION_KEY = 'MODEL'
const MAX_ACCEPTABLE_GRAPHQL_CLIENT_TIME_DIFF_MS = 1000 * 30 // 30 seconds

export default class Model {
  constructor ({ io }) {
    const ioEmit = (event, opts) => {
      return io.emit(event, opts)
    }

    this.graphqlClient = new GraphqlClient({
      ioEmit,
      io,
      isServerSide: (typeof window === 'undefined' || window === null)
    })

    const stream = ({ query, variables, pull }) => {
      const stream = this.graphqlClient.stream('graphql', { query, variables })
      if (pull) {
        return stream.pipe(rx.map(({ data }) => data?.[pull]))
      } else {
        return stream
      }
    }

    const call = async ({ query, variables, pull }) => {
      const response = await this.graphqlClient.call('graphql', { query, variables })
      this.graphqlClient.invalidateAll()
      // give time for invalidate to finish before being 'done'.
      // otherwise if a stream req is made immediately after the call is done
      // it sometimes breaks (stream simulataneous with invalidation)
      // eg saving scheduledBlast, routes back to scheduledBlasts page which
      // streams immediately
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (pull) {
        return response.data[pull]
      } else {
        return response
      }
    }

    this.note = new Note({ stream, call })
  }

  // after page has loaded, refetch all initial (cached) requestsStream to verify they're still up-to-date
  validateInitialCache = () => {
    const cache = this.initialCache
    const timeDiffMs = Math.abs(Date.now() - this.initialCacheTime)
    // allow for clock skew
    if (timeDiffMs < MAX_ACCEPTABLE_GRAPHQL_CLIENT_TIME_DIFF_MS) {
      console.log('graphqlClient cache up-to-date')
      return
    }

    this.initialCache = null

    console.log('refetching from graphqlClient for latest version')

    // could listen for postMessage from service worker to see if this is from
    // cache, then validate data
    const requestsStreamArr = _.map(cache, (result, key) => {
      let req
      try {
        req = JSON.parse(key)
      } catch (error) {
        req = {}
      }

      if (req.path) {
        return this.auth.stream(req.body, { ignoreCache: true })
      }
    }) //, options

    // TODO: seems to use anon cookie for this. not sure how to fix...
    // i guess keep initial cookie stored and run using that?

    // so need to handle the case where the cookie changes between server-side
    // cache and the actual get (when user doesn't exist from graphqlClient, but cookie gets user)

    return Rx.combineLatest(
      requestsStreamArr
    )
      .pipe(rx.take(1)).subscribe(responses => {
        responses = _.zipWith(responses, _.keys(cache), (response, req) => ({
          req,
          response
        }))
        const cacheArray = _.map(cache, (response, req) => ({
          req,
          response
        }))
        // see if our updated responses differ from the cached data.
        const changedReqs = _.differenceWith(responses, cacheArray, _.isEqual)
        // update with new values
        _.map(changedReqs, ({ req, response }) => {
          console.log('OUTDATED graphqlClient:', req, 'replacing...', response)
          return this.graphqlClient.setDataCache(req, response)
        })

        // there's a change this will be invalidated every time
        // eg. if we add some sort of timer / visitCount to user.getMe
        // i'm not sure if that's a bad thing or not. some people always
        // load from cache then update, and this would basically be the same
        if (!_.isEmpty(changedReqs)) {
          console.log('invalidating html cache...')
          return this.portal.call('cache.deleteHtmlCache')
        }
      })
  }

  wasCached = () => { return this.isFromCache }

  dispose = () => {
    return this.graphqlClient.disposeAll()
  }

  getSerializationStream = () => {
    return this.graphqlClient.getCacheStream()
      .pipe(rx.map(function (graphqlClientCache) {
        const string = JSON.stringify({
          graphqlClient: graphqlClientCache,
          now: Date.now()
        }).replace(/<\/script/gi, '<\\/script')
        return `window['${SERIALIZATION_KEY}']=${string};`
      })
      )
  }

  // synchronous version for crappy react ssr
  getSerialization = () => {
    const graphqlClientCache = this.graphqlClient.getSynchronousCache()
    const string = JSON.stringify({
      graphqlClient: graphqlClientCache,
      now: Date.now()
    }).replace(/<\/script/gi, '<\\/script')
    return `window['${SERIALIZATION_KEY}']=${string};`
  }
}
