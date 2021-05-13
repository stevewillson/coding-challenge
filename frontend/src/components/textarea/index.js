import { z, useStream } from 'zorium'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $textarea ({ valueStreams, placeholder }) {
  const { value } = useStream(() => ({
    value: valueStreams.stream
  }))

  return z('textarea.z-textarea', {
    placeholder,
    value,
    oninput: (e) => valueStreams.next(e.target.value)
  })
}
