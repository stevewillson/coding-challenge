import { z, useContext, useMemo, useStream } from 'zorium'
import * as _ from 'lodash-es'
import * as Rx from 'rxjs'
import * as rx from 'rxjs/operators'

import $input from '../input'
import { streams } from '../../services/obs'
import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $trees () {
  const { model, router } = useContext(context)

  const { searchValueStreams, treesStream } = useMemo(() => {
    const searchValueStreams = streams(Rx.of(''))
    return {
      searchValueStreams,
      // could technically just filter client-side, but wanted to
      // bring elasticsearch into the mix, since we use it to complement
      // scylladb
      treesStream: searchValueStreams.stream.pipe(
        rx.switchMap((searchValue) =>
          model.tree.getAll(searchValue)
        )
      )
    }
  }, [])

  const { trees } = useStream(() => ({
    trees: treesStream
  }))

  return z('.z-trees', [
    z('.title', 'trees'),
    z('.search', [
      z($input, {
        placeholder: 'Search',
        valueStreams: searchValueStreams
      })
    ]),
    _.map(trees?.nodes, (tree) => {
      return z('.tree', [
        z('.title', tree.title),
        router.link(z('a.edit', {
          href: `/editTree/${tree.slug}`
        }, 'edit'))
      ])
    })
  ])
}
