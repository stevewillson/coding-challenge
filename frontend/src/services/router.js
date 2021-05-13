function ev (fn) {
  return function (e) {
    const $$el = this
    return fn(e, $$el)
  }
}

function isSimpleClick (e) {
  return !((e.which > 1) || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey)
}

class RouterService {
  constructor ({ router }) {
    this.router = router
    this.history = (typeof window !== 'undefined') ? [window.location.pathname] : []
  }

  go = (path, options = {}) => {
    const { ignoreHistory, reset } = options

    if (!ignoreHistory) {
      this.history.push(path || globalThis?.window?.location.pathname)
    }

    if (this.history[0] === '/' || reset) {
      this.history = [path]
    }

    if (path) {
      return this.router?.go(path)
    }
  }

  back = () => {
    if ((this.history.length > 1) && (window.history.length > 0)) {
      window.history.back()
      return this.history.pop()
    } else {
      return this.go('/')
    }
  }

  getStream = () => {
    return this.router.getStream()
  }

  link = (node) => {
    node.props.onclick = ev((e, $$el) => {
      if (isSimpleClick(e)) {
        e.stopPropagation()
        e.preventDefault()
        return this.openLink(node.props.href, node.props.target)
      }
    })

    return node
  }

  linkIfHref = (node) => {
    if (node.props.href) {
      node.type = 'a'
      this.link(node)
    }

    return node
  }

  openLink = (url, target) => {
    const isHash = url?.substr(0, 1) === '#'
    const isMailto = url?.indexOf('mailto:') === 0
    const isAbsoluteUrl = isHash || isMailto || url?.match(/^(?:[a-z-]+:)?\/\//i)
    // don't route to /l/short-links since they don't use react
    const webAppRegex = new RegExp(`https?://(${this.host})(?!/l/)`, 'i')
    const isWebApp = url?.match(webAppRegex)
    if (!isAbsoluteUrl || isWebApp) {
      const path = isWebApp ? url.replace(webAppRegex, '') : url
      return this.go(path)
    } else if (isHash) {
      window.location.href = url
    } else {
      return this.portal.call('browser.openWindow', {
        url,
        target: target || '_blank'
      })
    }
  }
}

export default RouterService
