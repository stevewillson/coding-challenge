import app from '../server'
import config from '../src/config'

app.all('/*', function (req, res, next) {
  res.header(
    'Access-Control-Allow-Origin', config.WEBPACK_DEV_URL
  )
  res.header('Access-Control-Allow-Headers', 'X-Requested-With')
  return next()
})

console.log('listen')

app.listen(config.PORT, () => console.log({
  event: 'dev_server_start',
  message: `Listening on port ${config.PORT}`
}))
