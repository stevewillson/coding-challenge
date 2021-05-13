import { z, useContext, useMemo, useStream } from 'zorium'
import * as _ from 'lodash-es'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'

import $input from '../input'
import { streams } from '../../services/obs'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $notes () {
  const { model, router } = useContext(context)

  const { searchValueStreams, notesStream } = useMemo(() => {
    const searchValueStreams = streams(Rx.of(''))
    return {
      searchValueStreams,
      // could technically just filter client-side, but wanted to
      // bring elasticsearch into the mix, since we use it to complement
      // scylladb
      notesStream: searchValueStreams.stream.pipe(
        rx.switchMap((searchValue) =>
          model.note.getAll(searchValue)
        )
      )
    }
  }, [])

  const { notes } = useStream(() => ({
    notes: notesStream
  }))

  return z('.z-notes', [
    z('.title', 'notes'),
    z('.search', [
      z($input, {
        placeholder: 'Search',
        valueStreams: searchValueStreams
      })
    ]),
    _.map(notes?.nodes, (note) => {
      return z('.note', [
        z('.title', note.title),
        router.link(z('a.edit', {
          href: `/edit/${note.slug}`
        }, 'edit'))
      ])
    })
  ])
}
