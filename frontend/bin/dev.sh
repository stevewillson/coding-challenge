#!/bin/sh
[ -z "$NODE_ENV" ] && export NODE_ENV=development

node_modules/webpack-dev-server/bin/webpack-dev-server.js --config-register esm &
node_modules/nodemon/bin/nodemon.js -r esm ./bin/dev_server.js
