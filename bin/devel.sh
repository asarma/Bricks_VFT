#!/bin/bash -e

# cache sudo password
sudo -p "Sudo password: " echo -n

cd $(dirname $(readlink "$0" || echo "$0"))/..
./server.js dev
