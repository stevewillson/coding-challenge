import { z, useMemo, useStream } from 'zorium'
import * as _ from 'lodash-es'
import HttpHash from 'http-hash'
import * as rx from 'rxjs/operators'

import $notesPage from './pages/notes'
import $editNotePage from './pages/edit_note'
import $fourOhFourPage from './pages/404'
import GlobalContext from './context'

const routes = {
  '/': $notesPage,
  '/create': $editNotePage,
  '/edit/:slug': $editNotePage,
  '/notes': $notesPage
}

export default function $app (props) {
  const { serverData, model, router } = props

  const { requestsStream } = useMemo(() => {
    const hash = new HttpHash()
    _.forEach(routes, ($page, path) =>
      hash.set(path, $page)
    )

    const requestsStream = props.requestsStream.pipe(
      rx.map((req) => {
        const route = hash.get(req.path)
        const $page = route.handler || $fourOhFourPage
        return { req, route, $page }
      }),

      // shareReplay seems to work better. above map gets called a bunch more
      // if we use publishReplay, refCount
      rx.shareReplay(1)
    )

    return {
      requestsStream
    }
  }, [])

  const { request } = useStream(() => ({
    request: requestsStream.pipe(rx.tap((request) => {
      if (request.$page === $fourOhFourPage) {
        return serverData?.res?.status?.(404)
      }
    }))
  }))

  const $page = request?.$page

  return z(GlobalContext.Provider, {
    value: {
      model,
      router
    }
  }, [
    z($page, { requestsStream })
  ])
}
