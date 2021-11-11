import { z, useContext, useMemo } from 'zorium'
import * as rx from 'rxjs/operators'

import $editTree from '../../components/edit_tree'
import $menu from '../../components/menu'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $editTreePage ({ requestsStream }) {
  const { model } = useContext(context)

  const { treeStream } = useMemo(() => {
    return {
      treeStream: requestsStream.pipe(
        rx.switchMap(({ route }) => model.tree.getBySlug(route.params.slug))
      )
    }
  }, [])

  return z('.p-edit-tree', [
    z($menu),
    z($editTree, { treeStream })
  ])
}
