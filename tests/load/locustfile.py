"""Load test scenarios for RuleForge Chess.

Run with:
  cd /app/tests/load && locust -f locustfile.py --headless -u 100 -r 10 -t 60s --host http://localhost:8001

Scenarios cover the targets in PRD:
  - 1,000 concurrent users browsing
  -   100 users solving puzzles
  -   100 users joining tournament leaderboard
  -   500 users polling live leaderboards
"""
import random
import uuid
from locust import HttpUser, task, between

BASE = '/api'
DEFAULT_PASSWORD = 'QaTest@1234'


class BrowsingUser(HttpUser):
    wait_time = between(0.5, 2.0)
    weight = 5

    def on_start(self):
        email = f'load-{uuid.uuid4().hex[:10]}@ruleforgeqa.app'
        r = self.client.post(f'{BASE}/auth/register',
                             json={'email': email, 'password': DEFAULT_PASSWORD, 'name': 'Load'},
                             name='/auth/register')
        if r.status_code in (200, 201):
            self.token = r.json()['token']
            self.headers = {'Authorization': f'Bearer {self.token}'}
        else:
            self.token = None
            self.headers = {}

    @task(5)
    def browse_home(self):
        if not self.token:
            return
        self.client.get(f'{BASE}/auth/me', headers=self.headers, name='/auth/me')
        self.client.get(f'{BASE}/rules', headers=self.headers, name='/rules')
        self.client.get(f'{BASE}/puzzles/daily', headers=self.headers, name='/puzzles/daily')
        self.client.get(f'{BASE}/store', headers=self.headers, name='/store')

    @task(3)
    def view_leaderboard(self):
        if not self.token:
            return
        self.client.get(f'{BASE}/leaderboard/global?scope=global&limit=20',
                        headers=self.headers, name='/leaderboard/global')

    @task(2)
    def view_tournaments(self):
        if not self.token:
            return
        self.client.get(f'{BASE}/tournaments', headers=self.headers, name='/tournaments')

    @task(2)
    def view_live(self):
        if not self.token:
            return
        self.client.get(f'{BASE}/live/games', headers=self.headers, name='/live/games')


class PuzzleUser(HttpUser):
    wait_time = between(1, 3)
    weight = 2

    def on_start(self):
        email = f'puzzle-{uuid.uuid4().hex[:10]}@ruleforgeqa.app'
        r = self.client.post(f'{BASE}/auth/register',
                             json={'email': email, 'password': DEFAULT_PASSWORD, 'name': 'P'},
                             name='/auth/register-puzzle')
        self.headers = {'Authorization': f'Bearer {r.json()["token"]}'} if r.status_code in (200, 201) else {}

    @task
    def solve_random_puzzle(self):
        if not self.headers:
            return
        rp = self.client.get(f'{BASE}/puzzles/random', headers=self.headers, name='/puzzles/random')
        if rp.status_code != 200:
            return
        p = rp.json().get('puzzle') or {}
        pid = p.get('id')
        if not pid:
            return
        self.client.post(f'{BASE}/puzzles/{pid}/attempt',
                         headers=self.headers,
                         json={'moves': ['a2a3'], 'success': False, 'time_taken_ms': 2000, 'used_hint': False},
                         name='/puzzles/{id}/attempt')


class TournamentUser(HttpUser):
    wait_time = between(1, 4)
    weight = 1

    def on_start(self):
        email = f'tour-{uuid.uuid4().hex[:10]}@ruleforgeqa.app'
        r = self.client.post(f'{BASE}/auth/register',
                             json={'email': email, 'password': DEFAULT_PASSWORD, 'name': 'T'},
                             name='/auth/register-tour')
        self.headers = {'Authorization': f'Bearer {r.json()["token"]}'} if r.status_code in (200, 201) else {}
        # Cache live tournament id
        self.tid = None
        if self.headers:
            rows = self.client.get(f'{BASE}/tournaments?scope=live', headers=self.headers, name='/tournaments?live').json().get('tournaments', [])
            if rows:
                self.tid = rows[0]['id']
                self.client.post(f'{BASE}/tournaments/{self.tid}/join', headers=self.headers, name='/tournaments/{id}/join')

    @task(3)
    def fetch_leaderboard(self):
        if self.tid and self.headers:
            self.client.get(f'{BASE}/tournaments/{self.tid}/leaderboard', headers=self.headers,
                            name='/tournaments/{id}/leaderboard')

    @task
    def report_match(self):
        if self.tid and self.headers:
            self.client.post(f'{BASE}/tournaments/{self.tid}/report-match',
                             headers=self.headers,
                             json={'opponent_id': 'op', 'result': random.choice(['win', 'loss', 'draw'])},
                             name='/tournaments/{id}/report-match')
