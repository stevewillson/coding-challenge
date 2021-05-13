// react/react-dom -> preact
import 'module-alias/register'

import { z, renderToString, untilStable } from 'zorium'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'
import express from 'express'
import compress from 'compression'
import helmet from 'helmet'
import Promise from 'bluebird'
import socketIO from 'socket.io-client'
import { generateStaticHtml as generateStaticMetaHtml } from 'react-metatags-hook'

import $app from './src/app'
import $head from './src/components/head'
import Model from './src/models/index'
import RouterService from './src/services/router'
import config from './src/config'

const MIN_TIME_REQUIRED_FOR_HSTS_GOOGLE_PRELOAD_MS = 10886400000 // 18 weeks
const RENDER_TO_STRING_TIMEOUT_MS = 300
const BOT_RENDER_TO_STRING_TIMEOUT_MS = 2000

// don't crash on errors (this might be a bad idea?)
process.on('uncaughtException', (err) => {
  console.error(err)
  console.log('Node NOT exiting')
})

const app = express()
app.use(compress())

// CSP is disabled because kik lacks support
// frameguard header is disabled because Native app frames page
app.disable('x-powered-by')
app.use(helmet.xssFilter())
app.use(helmet.hsts({
  // https://hstspreload.appspot.com/
  maxAge: MIN_TIME_REQUIRED_FOR_HSTS_GOOGLE_PRELOAD_MS,
  includeSubDomains: true, // include in Google Chrome
  preload: true, // include in Google Chrome
  force: true
}))
app.use(helmet.noSniff())

app.use(getRouteFn())

function getRouteFn () {
  return async function route (req, res, next) {
    let userAgent = req.headers['user-agent']
    const host = req.headers.host?.replace('www.', '')
    const io = socketIO(config.API_HOST, {
      path: (config.API_PATH || '') + '/socket.io',
      timeout: 5000,
      transports: ['websocket']
    })
    var ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress
    const model = new Model({
      io,
      userAgent,
      host,
      ip,
      serverHeaders: req.headers
    })
    const router = new RouterService({
      model,
      host,
      configHost: config.HOST,
      router: null
    })
    const requestsStream = new Rx.BehaviorSubject(req)

    const serverData = { req, res }
    userAgent = req.headers?.['user-agent']
    const isFacebookCrawler = (userAgent?.indexOf('facebookexternalhit') !== -1) ||
        (userAgent?.indexOf('Facebot') !== -1)
    const isOtherBot = userAgent?.indexOf('bot') !== -1
    const isCrawler = isFacebookCrawler || isOtherBot

    const $tree = z($app, {
      requestsStream,
      model,
      serverData,
      router,
      isCrawler,
      config
    })
    const timeout = isCrawler
      ? BOT_RENDER_TO_STRING_TIMEOUT_MS
      : RENDER_TO_STRING_TIMEOUT_MS

    let cache
    try {
      // wait for initial models to load so we have graphqlClient cache we can use
      // in 2nd render. ideal solution is what zorium does with dyo
      // https://github.com/Zorium/zorium/blob/dyo/src/index.coffee
      // but react async server-side rendering sucks atm (5/2020)
      cache = await untilStable($tree, { timeout })
    } catch (err) {
      // If this times out, it should throw the hash of state object keys.
      // Use that to figure out which components are hanging and fix
      // eg a component could have a Streams that never gets a value
      console.log('untilStable err', err, req.originalUrl)
      cache = err?.cache
    }
    const graphqlClientCache = await (Promise.race([
      model.graphqlClient.getCacheStream().pipe(rx.take(1)).toPromise(),
      new Promise(resolve => { setTimeout(resolve, 100) })
    ]))
    if (!graphqlClientCache) {
      console.log('graphqlClient cache timed out')
    }
    model.graphqlClient.setSynchronousCache(graphqlClientCache)

    const bodyHtml = renderToString($tree, { cache })
    const metaHtml = generateStaticMetaHtml()
    const headHtml = renderToString(z($head, {
      serverData, metaHtml, model, config, router
    }))
    const html = `<html><head>${metaHtml}${headHtml}</head><body>${bodyHtml}</body></html>`
    io.disconnect()
    model.dispose()
    // console.log html
    if (!html && (req.path !== '/')) {
      console.log('redir')
      return res.redirect(302, '/')
    } else {
      return res.send('<!DOCTYPE html>' + html)
    }
  }
}

export default app
