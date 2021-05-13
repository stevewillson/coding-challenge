import { z, render } from 'zorium'
import LocationRouter from 'location-router'
import socketIO from 'socket.io-client/dist/socket.io.slim.js'
import * as rx from 'rxjs/operators'

import $app from './app'
import Model from './models'
import config from './config'

import RouterService from './services/router'

require('./root.styl')

const io = socketIO(config.API_HOST, {
  path: (config.API_PATH || '') + '/socket.io',
  transports: ['websocket']
})
const model = new Model({ io })

function init () {
  const router = new RouterService({
    model,
    router: new LocationRouter(),
    host: window.location.host,
    configHost: config.HOST
  })

  const requestsStream = router.getStream().pipe(
    rx.publishReplay(1), rx.refCount()
  )

  render(z($app, {
    key: Math.random(), // for hmr to work properly
    requestsStream,
    model,
    router,
    config
  }), document.body)
}

if ((document.readyState !== 'complete') && !document.body) {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

if (module.hot) {
  // webpack hmr
  module.hot.accept()
}
