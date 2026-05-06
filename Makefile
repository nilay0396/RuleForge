.PHONY: help test-backend test-unit test-api test-load load-light perf seed-users qa-status

help:
	@echo "RuleForge Chess — QA targets"
	@echo "  test-backend  : run pytest unit + API tests"
	@echo "  test-unit     : pytest unit only"
	@echo "  test-api      : pytest API only"
	@echo "  load-light    : 60-second locust smoke (100 users)"
	@echo "  test-load     : 5-minute locust load (500 users)"
	@echo "  seed-users    : create deterministic test accounts"
	@echo "  qa-status     : write pytest_summary.json for QA dashboard"

test-backend:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning unit api

test-unit:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning unit

test-api:
	cd tests && python -m pytest -q --tb=short -W ignore::DeprecationWarning api

seed-users:
	python scripts/seed_test_users.py

load-light:
	cd tests/load && locust -f locustfile.py --headless -u 100 -r 20 -t 60s --host http://localhost:8001 --csv /tmp/rf_load_light

test-load:
	cd tests/load && locust -f locustfile.py --headless -u 500 -r 50 -t 300s --host http://localhost:8001 --csv /tmp/rf_load

qa-status:
	mkdir -p test_reports
	cd tests && python -m pytest -q --tb=line -W ignore::DeprecationWarning unit api --json-report --json-report-file=/app/test_reports/pytest_raw.json 2>/dev/null || true
	python scripts/build_qa_status.py
