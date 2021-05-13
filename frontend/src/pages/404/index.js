import { z } from 'zorium'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $404Page () {
  return z('.p-404', 'page not found')
}
