import { z } from 'zorium'

import $menu from '../../components/menu'
import $notes from '../../components/notes'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $notesPage () {
  return z('.p-notes', [
    z($menu),
    z($notes)
  ])
}
