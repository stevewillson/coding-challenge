import _ from 'lodash'

import Tree from './model.js'

export default {
  Mutation: {
    treeUpsert: async (rootValue, { id, title, body, commonSpecies, botanicSpecies }) => {
      const diff = { title, body, commonSpecies, botanicSpecies }
      const existingTree = id && await Tree.getById(id)
      if (!existingTree) {
        diff.slug = await Tree.getUniqueSlug(_.kebabCase(title))
      }
      return Tree.upsertByRow(existingTree, diff)
    },

    treeDeleteById: async (rootValue, { id }) => {
      const tree = await Tree.getById(id)
      return Tree.deleteByRow(tree)
    }
  }
}
