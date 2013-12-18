SHELL := /usr/bin/env bash

default: node_modules

logicblox:
	cp plugins/logicblox.pivot/pivot.css node_modules/build/lb-c9/
	cp plugins/logicblox.components/vendor/* node_modules/build/lb-c9/
	(cd node_modules/architect-build; node build_logicblox)
	(cd docs/generate; ./build.logicblox.sh install-deps && ./build.logicblox.sh clean && ./build.logicblox.sh refguide) || echo "Error: could not generate docs"; mkdir -p docs/generate/output/docs

node_modules node_modules/: .PURPLEPONY
	@[ "`git status --porcelain node_modules/ | grep -Ev '^ D'`" == "" ] \
	   || (git status node_modules; echo; echo Changes in node_modules directory, cannot proceed.; exit 1)
	@echo -e "No local changes detected in node_modules, resetting it"
	rm -rf node_modules
	git checkout node_modules
	npm install

reinstall:
	git checkout node_modules
	npm install

test:
	test/run-server-tests.sh
	
static:
	./scripts/makestatic.sh

.PURPLEPONY: # this is a fake helper target 

.PHONY: test
