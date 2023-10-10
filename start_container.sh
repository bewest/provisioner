#!/bin/bash

echo starting container...
whoami
pwd
env
ls -alh /etc/nginx
# export INTERNAL_PORT=3737
# export PORT=4747

function run_mesh_router ( ) {
# default docker dns IP
export RESOLVER_IP=${RESOLVER_IP:-'127.0.0.11'}
erb nginx-router.conf.erb | tee /etc/nginx/nginx.conf
service nginx restart

# install and run
npm install
PORT=$INTERNAL_PORT node mesh-router.js
}

function main ( ) {
erb nginx.conf.erb | tee /etc/nginx/nginx.conf
service nginx restart

# install and run
npm install
PORT=$INTERNAL_PORT node server.js
}

case "${1-help}" in

  router)
    run_mesh_router
    ;;
  provisioner|main)
    main
    ;;
  help|--help|-h)
    echo $@
    echo $0 [command]
    cat <<-EOF
      $1 - this message
      bash or sh - run bash
      provisioner - run a classic provisioner instance
      router - run a classic router instance
EOF
    ;;

esac
