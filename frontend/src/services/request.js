import request from 'xhr-request'

export default (url, options) => new Promise(function (resolve, reject) {
  return request(url, options, function (err, data) {
    if (err) {
      return reject(err)
    } else {
      return resolve(data)
    }
  })
})
