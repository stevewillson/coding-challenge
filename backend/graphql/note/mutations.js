import _ from 'lodash'

import Note from './model.js'

export default {
  Mutation: {
    noteUpsert: async (rootValue, { id, title, body }) => {
      const diff = { title, body }
      const existingNote = id && await Note.getById(id)
      if (!existingNote) {
        diff.slug = await Note.getUniqueSlug(_.kebabCase(title))
      }
      return Note.upsertByRow(existingNote, diff)
    },

    noteDeleteById: async (rootValue, { id }) => {
      const note = await Note.getById(id)
      return Note.deleteByRow(note)
    }
  }
}
