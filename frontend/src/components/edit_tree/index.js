import { z, useContext, useMemo, useStream } from 'zorium'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'

import $input from '../input'
import $textarea from '../textarea'
import { streams } from '../../services/obs'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $home ({ treeStream }) {
  const { model, router } = useContext(context)

  const {
    isLoadingStream, titleValueStreams, bodyValueStreams
  } = useMemo(() => {
    return {
      isLoadingStream: new Rx.BehaviorSubject(false),
      titleValueStreams: streams(treeStream.pipe(
        rx.map((tree) => tree?.title)
      )),
      bodyValueStreams: streams(treeStream.pipe(
        rx.map((tree) => tree?.body)
      ))
    }
  }, [])

  const { isLoading, tree, title, body } = useStream(() => ({
    isLoading: isLoadingStream,
    tree: treeStream,
    title: titleValueStreams.stream,
    body: bodyValueStreams.stream
  }))

  const save = async () => {
    isLoadingStream.next(true)
    const updatedTree = await model.tree.upsert({ id: tree?.id, title, body })
    isLoadingStream.next(false)
    if (!tree) {
      router.go(`/editTree/${updatedTree.slug}`)
    }
  }

  return z('.z-edit-tree', [
    z('.title', tree ? 'Edit' : 'Create'),
    z('.input', [
      z($input, {
        placeholder: 'Tree Title',
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
