import { GraphqlFormatter } from '../../lib/index.js'
import Note from './model.js'

export default {
  Query: {
    async note (rootValue, { id, slug }, { org }) {
      if (id) {
        return Note.getById(id)
      } else if (slug) {
        return Note.getBySlug(slug)
      }
    },

    async notes (rootValue, { query, titleQueryStr, limit }, { org }) {
      if (titleQueryStr) {
        query = { wildcard: { title: `${titleQueryStr}*` } }
      } else {
        query = { match_all: {} }
      }
      const notes = await Note.search({ query, limit, trackTotalHits: true })
      return GraphqlFormatter.fromElasticsearch(notes)
    }
  }
}
