import cors from 'cors'
import express from 'express'
import Promise from 'bluebird'
import http from 'http'

import { setup, childSetup } from './services/setup.js'
import { listenHttp } from './http_server.js'
import { listenWs } from './ws_server.js'

Promise.config({ warnings: false })

const app = express()
app.set('x-powered-by', false)
app.use(cors())

app.get('/', (req, res) => res.status(200).send('ok'))

app.get('/ping', (req, res) => res.send('pong'))

const server = http.createServer(app)

listenHttp(app)
listenWs(server)

const serverPromise = Promise.resolve(server)

export { serverPromise, setup, childSetup }
