import { z } from 'zorium'

import $menu from '../../components/menu'
import $trees from '../../components/trees'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $treesPage () {
  return z('.p-trees', [
    z($menu),
    z($trees)
  ])
}
