.PHONY: help test-backend test-unit test-api test-e2e test-e2e-mobile test-e2e-desktop test-load load-light perf seed-users qa-status

help:
	@echo "RuleForge Chess — QA targets"
	@echo "  test-backend     : run pytest unit + API tests"
	@echo "  test-unit        : pytest unit only"
	@echo "  test-api         : pytest API only"
	@echo "  test-e2e         : Playwright E2E (iphone-12 project, all flows)"
	@echo "  test-e2e-mobile  : iPhone 12 + Galaxy S21 + iPad Mini"
	@echo "  test-e2e-desktop : Chromium desktop only"
	@echo "  load-light       : 60-second locust smoke (100 users)"
	@echo "  test-load        : 5-minute locust load (500 users)"
	@echo "  seed-users       : create deterministic test accounts"
	@echo "  qa-status        : write pytest_summary.json + e2e summary for QA dashboard"

test-backend:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning unit api

test-unit:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning unit

test-api:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning api

test-e2e:
	cd tests/e2e && E2E_BASE_URL=$${E2E_BASE_URL:-http://localhost:3000} npx playwright test --project=iphone-12

test-e2e-mobile:
	cd tests/e2e && E2E_BASE_URL=$${E2E_BASE_URL:-http://localhost:3000} npx playwright test --project=iphone-12 --project=galaxy-s21 --project=ipad-mini

test-e2e-desktop:
	cd tests/e2e && E2E_BASE_URL=$${E2E_BASE_URL:-http://localhost:3000} npx playwright test --project=chrome-desktop

seed-users:
	python scripts/seed_test_users.py

load-light:
	cd tests/load && locust -f locustfile.py --headless -u 100 -r 20 -t 60s --host http://localhost:8001 --csv /tmp/rf_load_light

test-load:
	cd tests/load && locust -f locustfile.py --headless -u 500 -r 50 -t 300s --host http://localhost:8001 --csv /tmp/rf_load

qa-status:
	python scripts/build_qa_status.py
