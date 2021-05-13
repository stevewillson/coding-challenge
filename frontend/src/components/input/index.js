import { z, useStream } from 'zorium'

if (typeof window !== 'undefined') { require('./index.styl') }

export default function $input ({ valueStreams, placeholder }) {
  const { value } = useStream(() => ({
    value: valueStreams.stream
  }))

  return z('input.z-input', {
    placeholder,
    value,
    oninput: (e) => valueStreams.next(e.target.value)
  })
}
