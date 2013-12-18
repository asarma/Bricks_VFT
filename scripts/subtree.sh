#!/bin/bash -e

COMMAND=$1
PACKAGE=$2
BRANCH=$3
SQUASH=$

if [[ "$COMMAND" == "pull" || "$COMMAND" == "add" ]]; then
  SQUASH=--squash
fi

usage() {
    echo "Usage: $0 <add | pull | push | split | merge> PACKAGE [BRANCH] [--squash]"
    echo "(--squash is added by default for add or pull)"
    echo
    exit 1
}

init() {
    cd `dirname $0`/..
    
    ( set +e
      git remote add connect-architect git@github.com:c9/connect-architect.git
      git remote add frontdoor git@github.com:c9/frontdoor.git
      git remote add vfs-socket git@github.com:c9/vfs-socket.git
      git remote add vfs-ssh git@github.com:c9/vfs-ssh.git
      git remote add vfs-http-adapter git@github.com:c9/vfs-http-adapter.git
      git remote add smith git@github.com:c9/smith.git
      git remote add treehugger git@github.com:ajaxorg/treehugger.git
      git remote add jsonalyzer git@github.com:c9/jsonalyzer.git
    ) 2>/dev/null || :
}

if ! [ "$COMMAND" ] || ! [ "$PACKAGE" ] || [ "$COMMAND" == "all" ]; then
    usage
fi

if ! [ "$BRANCH" ]; then
    BRANCH=master
fi

init

echo Pulling $PACKAGE, branch $BRANCH...
set -x
git fetch $PACKAGE
git subtree $COMMAND --prefix=node_modules/$PACKAGE $PACKAGE $BRANCH $SQUASH

