import autoBind from 'auto-bind'

import { Base, cknex } from '../../lib/index.js'

class Tree extends Base {
  constructor (...args) {
    super(...args)
    autoBind(this)
  }

  getScyllaTables () {
    return [
      {
        name: 'trees_by_id',
        keyspace: 'spore_coding_challenge',
        fields: {
          id: 'timeuuid',
          slug: 'text',
          title: 'text',
          body: 'text'
        },
        primaryKey: {
          partitionKey: ['id']
          // clusteringColumns: []
        },
        materializedViews: {
          trees_by_slug: {
            primaryKey: {
              partitionKey: ['slug'],
              clusteringColumns: ['id']
            }
          }
        }
      }
    ]
  }

  getElasticSearchIndices () {
    return [
      {
        name: 'trees',
        mappings: {
          slug: { type: 'keyword' },
          title: { type: 'search_as_you_type' },
          body: { type: 'text' }
        }
      }
    ]
  }

  getById (id) {
    return cknex().select('*')
      .from('trees_by_id')
      .where('id', '=', id)
      .run({ isSingle: true })
      .then(this.defaultOutput)
  }

  getBySlug (slug) {
    return cknex().select('*')
      .from('trees_by_slug')
      .where('slug', '=', slug)
      .run({ isSingle: true })
      .then(this.defaultOutput)
  }
}

export default new Tree()
