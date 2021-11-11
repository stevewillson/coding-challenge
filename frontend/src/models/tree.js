export default class Tree {
  constructor ({ stream, call }) {
    this.stream = stream
    this.call = call
  }

  getBySlug = (slug) => {
    return this.stream({
      query: `
        query TreeGetBySlug($slug: String) {
          tree(slug: $slug) {
            id
            slug
            title
            body
          }
        }`,
      variables: { slug },
      pull: 'tree'
    })
  }

  getAll = (titleQueryStr = '') => {
    console.log('get', titleQueryStr)
    return this.stream({
      query: `
        query TreeGetAll($titleQueryStr: String) {
          trees(titleQueryStr: $titleQueryStr) {
            nodes {
              id
              slug
              title
              body
            }
          }
        }`,
      variables: { titleQueryStr },
      pull: 'trees'
    })
  }

  upsert = ({ id, title, body }) => {
    return this.call({
      query: `
        mutation TreeUpsert(
          $id: ID
          $title: String
          $body: String
        ) {
          treeUpsert(id: $id, title: $title, body: $body) {
            id, slug
          }
        }`,
      variables: { id, title, body },
      pull: 'treeUpsert'
    }, { invalidateAll: true })
  }
}
