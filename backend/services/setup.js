import fs from 'fs'
import _ from 'lodash'
import Promise from 'bluebird'

import {
  cknex, elasticsearch, ElasticsearchSetup, ScyllaSetup, Cache, PubSub
} from '../lib/index.js'
import config from '../config.js'

export function sharedSetup () {
  Cache.setup({
    prefix: config.REDIS.PREFIX,
    cacheHost: config.REDIS.CACHE_HOST,
    persistentHost: config.REDIS.PERSISTENT_HOST,
    port: config.REDIS.port
  })
  cknex.setup('spore_coding_challenge', config.SCYLLA.CONTACT_POINTS)
  elasticsearch.setup(`${config.ELASTICSEARCH.HOST}:9200`)
  PubSub.setup(config.REDIS.PUB_SUB_HOST, config.REDIS.PORT, config.REDIS.PUB_SUB_PREFIX)
}

export async function setup () {
  sharedSetup()
  const graphqlFolders = _.filter(fs.readdirSync('./graphql'), file => file.indexOf('.') === -1)
  const scyllaTables = _.flatten(await Promise.map(graphqlFolders, async (folder) => {
    try {
      const model = await import(`../graphql/${folder}/model.js`)
      return model?.default?.getScyllaTables?.() || []
    } catch (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND' || err.message.indexOf("model.js' imported") === -1) {
        throw err
      }
      return []
    }
  }))
  const elasticSearchIndices = _.flatten(await Promise.map(graphqlFolders, async (folder) => {
    try {
      const model = await import(`../graphql/${folder}/model.js`)
      return model?.default?.getElasticSearchIndices?.() || []
    } catch (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND' || err.message.indexOf("model.js' imported") === -1) {
        throw err
      }
      return []
    }
  }))

  const isDev = config.ENV === config.ENVS.DEV
  const shouldRunSetup = true || (config.ENV === config.ENVS.PRODUCTION) ||
                    (config.SCYLLA.CONTACT_POINTS[0] === 'localhost')

  await Promise.all(_.filter([
    shouldRunSetup && ScyllaSetup.setup(scyllaTables, { isDev })
      .then(() => console.log('scylla setup')),
    shouldRunSetup && ElasticsearchSetup.setup(elasticSearchIndices)
      .then(() => console.log('elasticsearch setup'))
  ])).catch(err => console.log('setup', err))

  console.log('scylla & elasticsearch setup')
  cknex.enableErrors()
}

export function childSetup () {
  sharedSetup()
  cknex.enableErrors()
  return Promise.resolve(null) // don't block
}
