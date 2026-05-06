import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = 'rf_token';

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export type ApiError = { detail: string };

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (auth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : Array.isArray(data?.detail)
        ? data.detail.map((e: any) => e?.msg || JSON.stringify(e)).join(', ')
        : `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),
  register: (email: string, password: string, name: string) =>
    request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }, false),
  guest: () => request<{ token: string; user: any }>('/auth/guest', { method: 'POST' }, false),
  upgrade: (email: string, password: string, name: string) =>
    request<{ token: string; user: any }>('/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  me: () => request<{ user: any }>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // Content
  rules: () => request<{ rules: any[] }>('/rules', {}, false),
  rule: (key: string) => request<{ rule: any; quizzes: any[] }>(`/rules/${key}`, {}, false),
  scenarios: (key: string) =>
    request<{ scenarios: any[] }>(`/rules/${key}/scenarios`, {}, false),

  // Matches
  recordMatch: (body: any) =>
    request<{ match: any; user: any }>('/matches', { method: 'POST', body: JSON.stringify(body) }),
  myMatches: () => request<{ matches: any[] }>('/matches/me'),
  ratingHistory: () => request<{ history: any[] }>('/rating/history'),

  // Social
  searchUsers: (q: string) =>
    request<{ users: any[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  online: () => request<{ online: any[] }>('/online'),
  friends: () => request<{ accepted: any[]; incoming: any[]; outgoing: any[] }>('/friends'),
  friendRequest: (friend_id: string) =>
    request<{ friendship: any }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ friend_id }),
    }),
  friendAccept: (fid: string) =>
    request<{ ok: boolean }>(`/friends/${fid}/accept`, { method: 'POST' }),
  friendReject: (fid: string) =>
    request<{ ok: boolean }>(`/friends/${fid}/reject`, { method: 'POST' }),
  friendDelete: (fid: string) =>
    request<{ deleted: number }>(`/friends/${fid}`, { method: 'DELETE' }),
  challenges: () =>
    request<{ incoming: any[]; outgoing: any[] }>('/challenges'),
  createChallenge: (receiver_id: string, rule_key = 'classic') =>
    request<{ challenge: any }>('/challenges', {
      method: 'POST',
      body: JSON.stringify({ receiver_id, rule_key }),
    }),
  acceptChallenge: (cid: string) =>
    request<{ ok: boolean; game_id: string }>(`/challenges/${cid}/accept`, { method: 'POST' }),
  rejectChallenge: (cid: string) =>
    request<{ ok: boolean }>(`/challenges/${cid}/reject`, { method: 'POST' }),
  notifications: () =>
    request<{ notifications: any[]; unread: number }>('/notifications'),
  markAllRead: () =>
    request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),

  // Retention
  rewardState: () =>
    request<{ reward: { available: boolean; next_streak_if_claimed: number; multiplier: number; coins: number; xp: number } }>('/daily-reward/state'),
  claimReward: () =>
    request<{ claimed: boolean; coins: number; xp: number; multiplier: number; streak: number; user: any; already_claimed?: boolean }>(
      '/daily-reward/claim', { method: 'POST' }),
  puzzleDaily: () =>
    request<{ daily: any; puzzle: any; completed: boolean }>('/puzzles/daily'),
  puzzleRandom: () => request<{ puzzle: any }>('/puzzles/random'),
  puzzleGet: (id: string) => request<{ puzzle: any }>(`/puzzles/${id}`),
  puzzleAttempt: (id: string, body: { moves: string[]; success: boolean; time_taken_ms: number; used_hint: boolean }) =>
    request<any>(`/puzzles/${id}/attempt`, { method: 'POST', body: JSON.stringify(body) }),
  puzzleHistory: () =>
    request<{ history: any[]; solved: number; total: number }>('/puzzles/me/history'),

  // Daily
  daily: () => request<{ challenge: any; completed: boolean }>('/daily'),
  submitDaily: (moves_san: string[], completed: boolean) =>
    request<{ ok: boolean; user: any; already_completed?: boolean }>('/daily/submit', {
      method: 'POST',
      body: JSON.stringify({ moves_san, completed }),
    }),

  // Leaderboard
  leaderboard: () => request<{ leaderboard: any[] }>('/leaderboard', {}, false),

  // Admin
  adminCreateRule: (rule: any) =>
    request<{ rule: any }>('/admin/rules', { method: 'POST', body: JSON.stringify(rule) }),
  adminDeleteRule: (key: string) =>
    request<{ deleted: number }>(`/admin/rules/${key}`, { method: 'DELETE' }),
  adminSetDaily: (body: any) =>
    request<{ challenge: any }>('/admin/daily', { method: 'POST', body: JSON.stringify(body) }),
  adminCreateQuiz: (body: any) =>
    request<{ quiz: any }>('/admin/quizzes', { method: 'POST', body: JSON.stringify(body) }),
  adminDeleteQuiz: (id: string) =>
    request<{ deleted: number }>(`/admin/quizzes/${id}`, { method: 'DELETE' }),
  adminUsers: () => request<{ users: any[] }>('/admin/users'),

  // Anti-cheat hook (optional usage)
  validateMove: (fen: string, uci: string) =>
    request<{ legal: boolean; san?: string; fen?: string; reason?: string }>(
      '/move/validate',
      { method: 'POST', body: JSON.stringify({ fen, uci }) },
      false,
    ),

  // Monetization
  wallet: () =>
    request<{ coins: number; is_premium: boolean; recent: any[]; totals: Record<string, { total: number; count: number }> }>('/wallet'),
  transactions: (limit = 50) =>
    request<{ transactions: any[]; count: number }>(`/transactions?limit=${limit}`),
  store: (type?: string) =>
    request<{ items: any[]; grouped: Record<string, any[]> }>(
      `/store${type ? `?type=${encodeURIComponent(type)}` : ''}`,
    ),
  storeBuy: (key: string) =>
    request<{ ok: boolean; item_key: string; price_paid: number; coins: number; user: any }>(
      `/store/${encodeURIComponent(key)}/buy`,
      { method: 'POST' },
    ),
  inventory: () =>
    request<{ inventory: any[]; count: number }>('/inventory'),
  preferences: () =>
    request<{ preferences: { board_theme: string; piece_style: string; avatar: string } }>('/preferences'),
  setPreferences: (body: { board_theme?: string; piece_style?: string; avatar?: string }) =>
    request<{ preferences: { board_theme: string; piece_style: string; avatar: string } }>(
      '/preferences',
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  premium: () =>
    request<{ is_premium: boolean; benefits: any[]; price: any; since: string | null; renews_at: string | null }>('/premium'),
  premiumSubscribe: (method: 'mock' | 'coins' = 'mock', plan = 'monthly') =>
    request<{ ok: boolean; coins_paid: number; user: any }>(
      '/premium/subscribe',
      { method: 'POST', body: JSON.stringify({ method, plan }) },
    ),
  premiumCancel: () =>
    request<{ ok: boolean }>('/premium/cancel', { method: 'POST' }),
  adsState: () =>
    request<{ is_premium: boolean; available: boolean; remaining: number; limit: number; reward_coins: number }>('/ads/state'),
  adsReward: () =>
    request<{ ok: boolean; coins_earned: number; remaining: number; user: any }>(
      '/ads/reward',
      { method: 'POST' },
    ),

  // Tournaments
  tournaments: (scope: 'all' | 'live' | 'upcoming' | 'finished' = 'all') =>
    request<{ tournaments: any[] }>(`/tournaments?scope=${scope}`),
  tournamentDetail: (id: string) =>
    request<{ tournament: any; leaderboard: any[]; my_rank: number | null }>(
      `/tournaments/${encodeURIComponent(id)}`,
    ),
  tournamentJoin: (id: string) =>
    request<{ ok: boolean; joined?: boolean; already_joined?: boolean }>(
      `/tournaments/${encodeURIComponent(id)}/join`,
      { method: 'POST' },
    ),
  tournamentLeave: (id: string) =>
    request<{ ok: boolean }>(
      `/tournaments/${encodeURIComponent(id)}/leave`,
      { method: 'POST' },
    ),
  tournamentReport: (id: string, opponent_id: string, result: 'win' | 'loss' | 'draw') =>
    request<{ ok: boolean; score_added: number; player: any }>(
      `/tournaments/${encodeURIComponent(id)}/report-match`,
      { method: 'POST', body: JSON.stringify({ opponent_id, result }) },
    ),

  // Global leaderboard (extended)
  globalLeaderboard: (scope: 'global' | 'country' = 'global', country?: string, limit = 50) => {
    const q = new URLSearchParams({ scope, limit: String(limit) });
    if (country) q.set('country', country);
    return request<{ leaderboard: any[]; countries: string[] }>(`/leaderboard/global?${q.toString()}`);
  },

  // Watch live
  liveGames: () => request<{ games: any[]; count: number }>('/live/games'),
  liveGameDetail: (id: string) =>
    request<{ game_id: string; white: any; black: any; rule_key: string; fen: string; moves_san: string[]; spectators: number }>(
      `/live/games/${encodeURIComponent(id)}`,
    ),
  featuredPlayers: () => request<{ featured: any[] }>('/featured-players'),

  // Badges
  badges: () => request<{ badges: any[] }>('/badges'),
  myBadges: () => request<{ badges: any[]; count: number }>('/badges/me'),

  // Country
  setCountry: (country: string) =>
    request<{ ok: boolean; country: string }>('/profile/country', {
      method: 'PUT',
      body: JSON.stringify({ country }),
    }),

  // Match share
  matchShare: (id: string) =>
    request<{ share: { title: string; text: string; result: string; rating_after?: number; elo_delta?: number; rule_key?: string }; match_id: string }>(
      `/matches/${encodeURIComponent(id)}/share`,
    ),

  // QA / release readiness (admin)
  qaDashboard: () =>
    request<{
      total_bugs: number; open_bugs: number;
      by_severity: { blocker: number; critical: number; major: number; minor: number };
      tests: any; performance: any;
      release_ready: boolean; blockers: string[];
    }>('/qa/dashboard'),
  qaBugs: (params?: { status?: string; severity?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.severity) q.set('severity', params.severity);
    return request<{ bugs: any[]; count: number }>(`/qa/bugs${q.toString() ? `?${q}` : ''}`);
  },
  qaCreateBug: (body: { title: string; severity: string; feature: string; steps?: string; expected?: string; actual?: string; assigned_to?: string; notes?: string }) =>
    request<{ bug: any }>('/qa/bugs', { method: 'POST', body: JSON.stringify(body) }),
  qaUpdateBug: (id: string, patch: Record<string, any>) =>
    request<{ bug: any }>(`/qa/bugs/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  qaUatStatus: () =>
    request<{
      version: string;
      ready: boolean;
      uat: {
        exists: boolean;
        build: string | null;
        run_date: string | null;
        total: number;
        passed: number;
        auto_pass: number;
        manual_pass: number;
        failed: number;
        blocked: number;
        pass_rate: number;
        sections: { name: string; total: number; passed: number; failed: number; blocked: number }[];
        verdict: string | null;
      };
    }>('/qa/uat-status'),
};
