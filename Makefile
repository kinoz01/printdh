SHELL := /bin/bash
NPM ?= npm

.PHONY: install build run start lint clean

install:
	$(NPM) install

build: install
	$(NPM) run build

run: install
	$(NPM) run dev

start: install
	$(NPM) run start

lint: install
	$(NPM) run lint

clean:
	rm -rf .next
