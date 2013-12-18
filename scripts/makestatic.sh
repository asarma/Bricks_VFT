#!/bin/bash -e

cd `dirname $0`
CURDIR=`pwd`
REVISION=`git rev-parse HEAD`
REV=${REVISION:0:8}
CACHE=/tmp/cdn
VERSION=nc-`node -e 'console.log(require("../package.json").version)'`-$REV
DEST=$CACHE/$VERSION

#CDN="echo server.js cdn-cli"
CDN="$CURDIR/../server.js cdn-cli --settings deploy"

rm -rf $DEST

for i in `cd $CURDIR/../node_modules/ace/lib/ace/mode && find . -maxdepth 1 | grep -P '^\.\/[^_]*.js$'`; do \
    MODE=ace/mode/${i:2:-3}
    echo building mode $MODE
    $CDN --module $MODE
done

for i in `cd $CURDIR/../node_modules/ace/lib/ace/mode && find . -maxdepth 1 | grep -P '_worker.js$'`; do \
    WORKER=ace/mode/${i:2:-3}
    echo building worker $WORKER
    $CDN --worker $WORKER
done
WORKER=plugins/c9.ide.language/worker
echo building worker $WORKER
$CDN --worker $WORKER

for i in `cd $CURDIR/../node_modules/ace/lib/ace/theme && find . -maxdepth 1 | grep -P '.js$'`; do \
    THEME=ace/theme/${i:2:-3}
    echo building theme $THEME
    $CDN --module $THEME
done

#for CONFIG in "ssh" "openshift" "workspace-logicblox"; do \
for CONFIG in "openshift" "workspace-logicblox"; do \
    echo building config $CONFIG
    $CDN --config $CONFIG
    $CDN --config $CONFIG --skin dark
    $CDN --config $CONFIG --skin white
done

# right now ssh and openshift are identical
cp $DEST/config/openshift.js $DEST/config/ssh.js
cp -R $DEST/skin/openshift $DEST/skin/ssh

echo Compressing files
for i in `find $DEST -type f -name "*.css" -o -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.svg" -o -name "*.xml"`; do \
	gzip -9 -v -c -q -f $i > $i.gz || true
done

cd $CACHE
tar --exclude-from=$CURDIR/s3exclude -czf $VERSION.tgz $VERSION

echo Uploading to the static server
ssh ubuntu@static.c9.io "cd static && rm -rf $VERSION*"
scp $VERSION.tgz ubuntu@static.c9.io:static
ssh ubuntu@static.c9.io "cd static && tar xfz $VERSION.tgz"
