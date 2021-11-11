import { GraphqlFormatter } from '../../lib/index.js'
import Tree from './model.js'

export default {
  Query: {
    async tree (rootValue, { id, slug }, { org }) {
      if (id) {
        return Tree.getById(id)
      } else if (slug) {
        return Tree.getBySlug(slug)
      }
    },

    async trees (rootValue, { query, titleQueryStr, limit }, { org }) {
      if (titleQueryStr) {
        query = { wildcard: { title: `${titleQueryStr}*` } }
      } else {
        query = { match_all: {} }
      }
      const trees = await Tree.search({ query, limit, trackTotalHits: true })
      return GraphqlFormatter.fromElasticsearch(trees)
    }
  }
}
