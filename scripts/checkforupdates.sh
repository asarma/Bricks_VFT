APPROOT=~/Applications/cloud9.app/Contents/Resources
APPPATH=~/Applications/cloud9.app/Contents/Resources/app.nw
UPDATEDIR=~/.c9/updates/updatepackage
VERSIONFILE=~/.c9/version

# Get the current version
VERSION=`cat $VERSIONFILE`

set -e

# Check if update exists
if [ -e $UPDATEDIR ]; then
    
    # Read the version of the update
    UPDATEVERSION=`cat $UPDATEDIR/version`
    
    # if the update package doesn't have a version discard
    if [ -z $UPDATEVERSION ]; then
        rm -Rf $UPDATEDIR
        exit 100
    fi
    
    echo "Updating Cloud9 IDE..."
    
    if [ -z $VERSION ]; then
        VERSION=last
    fi
    
    # Define the location of the backup dir
    BACKUPDIR=$APPROOT/$VERSION.nw;

    # Remove backup dir if it exists
    rm -Rf $BACKUPDIR 2> /dev/null

    # Move all files to the backup dir
    mv $APPPATH $BACKUPDIR
    
    # Move the updated files to app.nw
    mv $UPDATEDIR $APPPATH
    
    # Write the version file
    echo $UPDATEVERSION > $VERSIONFILE
    
    echo "Updating Done."
    
    # Cleanup 
    rm ~/.c9/updates/*
    
    exit 0
else
    exit 0
fi