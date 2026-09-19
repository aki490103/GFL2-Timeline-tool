TOOL_DIR := tool
PRETTIER := prettier@3
FORMAT_TARGETS := src index.html *.ts *.js

.DEFAULT_GOAL := help

.PHONY: help
help: ## このヘルプを表示する
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## 依存パッケージをインストールする
	cd $(TOOL_DIR) && npm ci

$(TOOL_DIR)/node_modules: $(TOOL_DIR)/package-lock.json
	cd $(TOOL_DIR) && npm ci
	@touch $@

.PHONY: dev
dev: $(TOOL_DIR)/node_modules ## ローカルで開発サーバーを起動する
	cd $(TOOL_DIR) && npm run dev

.PHONY: test
test: $(TOOL_DIR)/node_modules ## テストを実行する
	cd $(TOOL_DIR) && npm test

.PHONY: lint
lint: $(TOOL_DIR)/node_modules ## Lint を実行する
	cd $(TOOL_DIR) && npm run lint

.PHONY: lock
lock: $(TOOL_DIR)/node_modules ## 共有URLの添字表(order-lock.ts)にデータの追加分を追記する
	cd $(TOOL_DIR) && UPDATE_ORDER_LOCK=1 npx vitest run src/data/order-lock.sync.test.ts
	@# 生成直後は未整形なので、単体で実行しても format-check を通る状態にしておく
	cd $(TOOL_DIR) && npx --yes $(PRETTIER) --write --log-level warn src/data/order-lock.ts

.PHONY: format
format: lock ## ソースコードをフォーマットする（添字表の更新込み）
	cd $(TOOL_DIR) && npx --yes $(PRETTIER) --write $(FORMAT_TARGETS)

.PHONY: format-check
format-check: ## フォーマット差分がないか確認する（書き換えない）
	cd $(TOOL_DIR) && npx --yes $(PRETTIER) --check $(FORMAT_TARGETS)
