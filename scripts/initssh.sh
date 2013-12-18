#!/bin/bash

NODE_VERSION=v0.10.21

cd $HOME
mkdir -p .c9/bin
mkdir -p .c9/node_modules
cd .c9

rm -rf node 
rm -rf node-$NODE_VERSION*
 
wget http://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz
tar xvfz node-$NODE_VERSION-linux-x64.tar.gz
mv node-$NODE_VERSION-linux-x64 node
rm node-$NODE_VERSION-linux-x64.tar.gz
 
NPM=$HOME/.c9/node/bin/npm
NODE=$HOME/.c9/node/bin/node
 
$NPM install coffee less typescript pty.js
$NPM install https://github.com/c9/nak/tarball/ea1299a3688f307d2269c93bd9692101eb4f262e

for FILE in $HOME/.c9/node_modules/.bin/* 
do
    perl -i -p -e 's/#!\/usr\/bin\/env node/#!'${NODE//\//\\\/}'/' $(readlink -f $FILE)
done

ln -sf `which tmux` $HOME/.c9/bin
