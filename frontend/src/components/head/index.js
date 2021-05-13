import { z } from 'zorium'

import fontsCss from './fonts'

export default function $head (props) {
  const { serverData, model, config } = props

  const bundlePath = serverData?.bundlePath ||
    globalThis?.document?.getElementById('bundle')?.src
  const bundleCssPath = serverData?.bundleCssPath ||
    globalThis?.document?.getElementById('bundle-css')?.href

  const modelSerialization = !globalThis?.window && model.getSerialization()

  const isInliningSource = config.ENV === config.ENVS.PROD

  return [
    z('script#model.model', {
      key: 'model',
      dangerouslySetInnerHTML: {
        __html: modelSerialization || ''
      }
    }),

    z('style#fonts', { key: 'fonts' }, fontsCss),

    // styles
    isInliningSource &&
      z('link#bundle-css', {
        rel: 'stylesheet',
        type: 'text/css',
        href: bundleCssPath
      }),

    // scripts
    z('script#bundle', {
      key: 'bundle',
      async: true,
      crossorigin: true, // req for error eventListener to not just spit out "script error"
      src: bundlePath || `${config.WEBPACK_DEV_URL}/bundle.js`
    })
  ]
}

export function getDefaultMeta ({ org, lang, cssVars, config }) {
  return {
    metas: [
      {
        name: 'viewport',
        content: 'initial-scale=1.0, width=device-width, minimum-scale=1.0, maximum-scale=1.0, user-scalable=0, minimal-ui, viewport-fit=cover'
      },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'msapplication-tap-highlight', content: 'no' }
    ],

    links: [
      { rel: 'icon', href: config.FAVICON_URL },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com/' } // faster dns for fonts
    ]
  }
}
