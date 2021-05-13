import { z, useContext, useMemo, useStream } from 'zorium'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'

import $input from '../input'
import $textarea from '../textarea'
import { streams } from '../../services/obs'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $home ({ noteStream }) {
  const { model, router } = useContext(context)

  const {
    isLoadingStream, titleValueStreams, bodyValueStreams
  } = useMemo(() => {
    return {
      isLoadingStream: new Rx.BehaviorSubject(false),
      titleValueStreams: streams(noteStream.pipe(
        rx.map((note) => note?.title)
      )),
      bodyValueStreams: streams(noteStream.pipe(
        rx.map((note) => note?.body)
      ))
    }
  }, [])

  const { isLoading, note, title, body } = useStream(() => ({
    isLoading: isLoadingStream,
    note: noteStream,
    title: titleValueStreams.stream,
    body: bodyValueStreams.stream
  }))

  const save = async () => {
    isLoadingStream.next(true)
    const updatedNote = await model.note.upsert({ id: note?.id, title, body })
    isLoadingStream.next(false)
    if (!note) {
      router.go(`/edit/${updatedNote.slug}`)
    }
  }

  return z('.z-edit-note', [
    z('.title', note ? 'Edit' : 'Create'),
    z('.input', [
      z($input, {
        placeholder: 'Title',
        valueStreams: titleValueStreams
      })
    ]),
    z('.textarea', [
      z($textarea, {
        placeholder: 'Body',
        valueStreams: bodyValueStreams
      })
    ]),
    z('button', { onclick: save }, isLoading ? 'Loading...' : 'Save')
  ])
}
