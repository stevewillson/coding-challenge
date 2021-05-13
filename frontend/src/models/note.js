export default class Note {
  constructor ({ stream, call }) {
    this.stream = stream
    this.call = call
  }

  getBySlug = (slug) => {
    return this.stream({
      query: `
        query NoteGetBySlug($slug: String) {
          note(slug: $slug) {
            id
            slug
            title
            body
          }
        }`,
      variables: { slug },
      pull: 'note'
    })
  }

  getAll = (titleQueryStr = '') => {
    console.log('get', titleQueryStr)
    return this.stream({
      query: `
        query NoteGetAll($titleQueryStr: String) {
          notes(titleQueryStr: $titleQueryStr) {
            nodes {
              id
              slug
              title
              body
            }
          }
        }`,
      variables: { titleQueryStr },
      pull: 'notes'
    })
  }

  upsert = ({ id, title, body }) => {
    return this.call({
      query: `
        mutation NoteUpsert(
          $id: ID
          $title: String
          $body: String
        ) {
          noteUpsert(id: $id, title: $title, body: $body) {
            id, slug
          }
        }`,
      variables: { id, title, body },
      pull: 'noteUpsert'
    }, { invalidateAll: true })
  }
}
