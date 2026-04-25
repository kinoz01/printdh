SHELL := /bin/bash
NPM ?= npm
NVM_DIR ?= $(HOME)/.nvm
NVM_SH := $(NVM_DIR)/nvm.sh

define run_with_project_node
	@if [ -s "$(NVM_SH)" ]; then \
		. "$(NVM_SH)" && nvm use --silent >/dev/null && $(1); \
	elif command -v node >/dev/null 2>&1; then \
		required="$$(cat .nvmrc)"; \
		current="$$(node -v | sed 's/^v//')"; \
		if [ "$$(printf '%s\n%s\n' "$$required" "$$current" | sort -V | head -n1)" = "$$required" ]; then \
			$(1); \
		else \
			echo "nvm not found at $(NVM_SH)"; \
			echo "Found system Node $$current, but this project requires Node >= $$required."; \
			exit 1; \
		fi; \
	else \
		echo "nvm not found at $(NVM_SH)"; \
		echo "Install nvm or run this project with Node >= $$(cat .nvmrc) manually."; \
		exit 1; \
	fi
endef

.PHONY: install build run start lint clean

install:
	$(call run_with_project_node,$(NPM) install)

build: install
	$(call run_with_project_node,$(NPM) run build)

run: install
	$(call run_with_project_node,$(NPM) run dev)

start: install
	$(call run_with_project_node,$(NPM) run start)

lint: install
	$(call run_with_project_node,$(NPM) run lint)

clean:
	rm -rf .next
