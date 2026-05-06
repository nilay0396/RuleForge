# RuleForge Chess — UAT Checklist

> Run end-to-end through every test below before tagging a release. Update
> `Status` and `Notes` columns. Status legend: ✅ Pass · ❌ Fail · ⚠️ Blocked · ⏱️ Pending

## Login / Signup
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| AUTH-01 | Open app → Register with new email | Account created, redirected to home | ⏱️ | |
| AUTH-02 | Logout → Login with valid creds | Redirected to home, name + elo visible | ⏱️ | |
| AUTH-03 | Login with wrong password | Inline error, no token stored | ⏱️ | |
| AUTH-04 | Tap “Continue as Guest” | Guest session, can play offline | ⏱️ | |
| AUTH-05 | Force-quit and re-open app | Session restored from secure storage | ⏱️ | |

## Offline Chess
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| OFF-01 | Play classic, make 4 moves | Pieces animate; legal moves only | ⏱️ | |
| OFF-02 | Try illegal pawn jump | Move rejected, square deselected | ⏱️ | |
| OFF-03 | Capture opp queen | Capture sound; piece removed | ⏱️ | |
| OFF-04 | Resign mid-game | Modal: result=loss, ELO updates | ⏱️ | |
| OFF-05 | New game from in-game menu | Confirmation dialog, then board resets | ⏱️ | |
| OFF-06 | Undo before opponent moved | Allowed once | ⏱️ | |
| OFF-07 | Abort before first move | No ELO change | ⏱️ | |

## Rule Variants
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| RULE-01 | Start King Dash mode | King can move 2 squares once | ⏱️ | |
| RULE-02 | Start Power Pawns mode | Pawns can move 2 squares any time | ⏱️ | |
| RULE-03 | Start Swap Move mode | Player can swap 2 own pieces once | ⏱️ | |
| RULE-04 | Win in custom rule | rule_breaker badge awarded | ⏱️ | |

## Guided Learning
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| LRN-01 | Open King Dash lesson | First scenario loads with hint | ⏱️ | |
| LRN-02 | Complete scenario | Progress saved; next scenario unlocked | ⏱️ | |

## Multiplayer
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| MP-01 | Two devices: queue both | Match starts within 5s | ⏱️ | |
| MP-02 | Move on device A | Move appears on device B < 500ms | ⏱️ | |
| MP-03 | Disconnect device A briefly | Reconnect resumes from current FEN | ⏱️ | |
| MP-04 | Try to move when not your turn | Move blocked client + server | ⏱️ | |
| MP-05 | Resign | Both clients see result | ⏱️ | |

## Friends / Challenges
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| FR-01 | Search by email | Result list shows user | ⏱️ | |
| FR-02 | Send friend request | Notification appears for receiver | ⏱️ | |
| FR-03 | Accept request | Both users now show in friends list | ⏱️ | |
| FR-04 | Send game challenge | Challenge surfaces; on accept game opens | ⏱️ | |

## Puzzles
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| PZ-01 | Open daily puzzle | Loads with hint button | ⏱️ | |
| PZ-02 | Solve correctly | +25 XP daily bonus, +10 coins, marked completed | ⏱️ | |
| PZ-03 | Tap random puzzle | Within ±150 of puzzle rating | ⏱️ | |

## Rewards / Streaks
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| REW-01 | First login of day | Reward modal auto-opens | ⏱️ | |
| REW-02 | Claim reward | Coins +50, XP +25, streak=1 | ⏱️ | |
| REW-03 | Claim again same day | already_claimed=true; no double credit | ⏱️ | |

## Ratings
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| RTG-01 | Win vs higher AI | ELO increases; positive delta in modal | ⏱️ | |
| RTG-02 | Lose to lower AI | ELO decreases | ⏱️ | |

## Store / Premium
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| ST-01 | Earn coins via daily reward | Wallet shows updated balance | ⏱️ | |
| ST-02 | Buy emerald board | Coins decrement, item in inventory | ⏱️ | |
| ST-03 | Equip new theme | Equipped marker appears | ⏱️ | |
| ST-04 | Watch ad | +15 coins, remaining decrements | ⏱️ | |
| ST-05 | Hit ad limit (3) | 4th attempt 429 with friendly text | ⏱️ | |
| PRM-01 | Subscribe via mock | is_premium=true, exclusive items unlock | ⏱️ | |
| PRM-02 | Cancel premium | Reverts; exclusive items lock again | ⏱️ | |

## Tournaments
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| TR-01 | Open Tournaments tab | Live + upcoming visible | ⏱️ | |
| TR-02 | Join live tournament | tournament_join badge awarded | ⏱️ | |
| TR-03 | Report a win | Score +3, leaderboard updates | ⏱️ | |
| TR-04 | Leave tournament | Removed from leaderboard | ⏱️ | |

## Spectator
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| SP-01 | Open Watch tab | Live games + featured visible | ⏱️ | |
| SP-02 | Tap a live game | Spectate screen loads with snapshot | ⏱️ | |
| SP-03 | Player makes move | Spectator board syncs (poll or WS) | ⏱️ | |

## Admin Panel
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| ADM-01 | Login as admin | Admin link/button visible | ⏱️ | |
| ADM-02 | Open QA dashboard | Stats render | ⏱️ | |
| ADM-03 | Create bug | Appears in list with status=open | ⏱️ | |
| ADM-04 | Mark bug fixed | Status updates; counts refresh | ⏱️ | |
| ADM-05 | Mark featured player | is_featured=true; appears on Watch | ⏱️ | |

## Mobile Responsiveness
| ID | Steps | Expected | Status | Notes |
|----|-------|----------|--------|-------|
| RES-01 | iPhone 12 (390x844) | Layout fits, no horizontal scroll | ⏱️ | |
| RES-02 | Galaxy S21 (360x800) | Same as above | ⏱️ | |
| RES-03 | iPad Mini (768x1024) | Tab bar still usable, board centered | ⏱️ | |
| RES-04 | Browser Chrome desktop | Web build renders without overflow | ⏱️ | |
