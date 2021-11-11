import { z, useContext } from 'zorium'

import context from '../../context'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $menu () {
  const { router } = useContext(context)

  return z('.z-menu', [
    router.link(z('a.link', {
      href: '/notes'
    }, 'Notes')),
    router.link(z('a.link', {
      href: '/create'
    }, 'Create')),
    router.link(z('a.link', {
      href: '/trees'
    }, 'Trees')),
    router.link(z('a.link', {
      href: '/createTree'
    }, 'Create Tree'))
  ])
}
