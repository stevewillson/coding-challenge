import { z, useContext, useMemo } from 'zorium'
import * as rx from 'rxjs/operators'

import $editNote from '../../components/edit_note'
import $menu from '../../components/menu'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $editNotePage ({ requestsStream }) {
  const { model } = useContext(context)

  const { noteStream } = useMemo(() => {
    return {
      noteStream: requestsStream.pipe(
        rx.switchMap(({ route }) => model.note.getBySlug(route.params.slug))
      )
    }
  }, [])

  return z('.p-edit-note', [
    z($menu),
    z($editNote, { noteStream })
  ])
}
