import Promise from 'bluebird'
import _ from 'lodash'

import CacheService from './cache.js'
import elasticsearch from './elasticsearch.js'

/*
to migrate tables
post http://localhost:9200/_reindex
{
"source": {"index": "campgrounds", "type": "_doc"}, "dest": {"index": "campgrounds_new", "type": "_doc"},
  "script": {
    "inline": "ctx._source.remove('forecast')",
    "lang": "painless"
  }
}

{
"dest": {"index": "campgrounds", "type": "_doc"}, "source": {"index": "campgrounds_new", "type": "_doc"},
  "script": {
    "inline": "ctx._source.remove('forecast')",
    "lang": "painless"
  }
}

*/

class ElasticsearchSetupService {
  constructor () {
    this.setup = this.setup.bind(this)
  }

  setup (indices) {
    return CacheService.lock('elasticsearch_setup8', () => {
      // console.log('setup', indices)
      return Promise.each(indices, this.createIndexIfNotExist)
    }
    , { expireSeconds: 300 })
  }

  createIndexIfNotExist (index) {
    console.log('create index', index.name)
    return elasticsearch.client.indices.create({
      index: index.name,
      body: {
        mappings: {
          properties: index.mappings,
          _source: index._source
        },
        settings: {
          number_of_shards: 3,
          number_of_replicas: 2
        }
      }
    })
      .catch((err) => {
        if (err.body.error.type !== 'resource_already_exists_exception') {
          console.log('caught', err)
        }
        // add any new mappings
        return Promise.all(_.map(index.mappings, (value, key) => {
          elasticsearch.client.indices.putMapping({
            index: index.name,
            body: {
              properties: {
                [key]: value
              }
            }
          })
        })).catch(() => null)
      })
  }
}
// Promise.resolve null

export default new ElasticsearchSetupService()
