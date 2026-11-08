"""Shared save-seed library for the Hormuz audit probes.

Every builder returns a COMPLETE, valid GameState dict (mirrors
`initialGame()` + `initialIdle()` in src/lib/game.ts / progression.ts, so it
passes `hydrateGame` untouched). Probes inject the dict through
`seed_js()` — the proven localStorage pattern from the repo's hidden_test_*
probes: replace `hormuz-game-v1`, stamp `lastSavedAt = Date.now()` (so no
offline reward fires), lock `setItem` to a no-op for the key, then reload.

Tower matrix (fix-program §TESTINFRA): 6 families x {tier 3, tier 4 branch 0,
tier 4 branch 1} = 18 configurations, on strait slots.
"""
from __future__ import annotations

import copy
import json

SAVE_KEY = "hormuz-game-v1"

TOWER_KINDS = ["cannon", "heavy", "missile", "air", "ew", "boat"]
ALL_ISLANDS = [
    "main", "qeshm", "hormuz", "larak", "hengam", "tombs", "abumusa",
    "kish", "siri", "farur", "lavan", "jask", "farsi", "kharg",
]
# Home slot per family — on/near the enemy lane in the strait core, all used
# by earlier probes (fx/anim suites) and known to engage lane traffic.
HOME_SLOT = {"cannon": 2, "heavy": 5, "missile": 9, "air": 12, "ew": 8, "boat": 4}
# 18 distinct strait slots for the all-configs matrix seed.
MATRIX_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

RICH_RESOURCES = {"cash": 50000, "oil": 800, "fuel": 900, "steel": 1200, "ammo": 2500}


def initial_idle() -> dict:
    """Mirror of initialIdle() in src/lib/progression.ts."""
    return {
        "revision": 0, "bank": 260, "collected": 0, "collections": 0,
        "collectionStreak": 0, "lastCollectionAt": -1000, "lifetimeIncome": 0,
        "xp": 0, "upgradeCount": 0, "claimedMissions": [], "claimedMilestones": [],
        "managerLevels": {"harbor": 0, "energy": 0, "supply": 0}, "managerClock": 0,
        "boostCharges": 2, "boostRemaining": 0, "boostRecharge": 0,
        "autoBattle": False, "stars": {}, "lastBattle": None,
        "waveStartedAt": 0, "waveStartKills": 0, "rewards": [], "lootSeed": 17381,
        "openedChests": 0, "completedContracts": 0, "contract": None,
        "offline": None, "appliedDailyIds": [],
        "port": {"tanker": {"stage": "approach", "progress": 0, "load": 0},
                 "nextIn": 0, "cycles": 0},
        "platforms": [], "challengeRuns": 0,
    }


def base_state() -> dict:
    """Mirror of initialGame() in src/lib/game.ts (fresh player)."""
    return {
        "version": 1, "idle": initial_idle(),
        "cash": 1200, "oil": 300, "fuel": 200, "steel": 150, "ammo": 300,
        "oilSplit": 40, "combo": 0, "comboTimer": 0, "maxCombo": 0,
        "waveLeaked": False, "slowmo": 0,
        "buildings": {"oil": 1, "tank": 1, "dock": 1, "refinery": 0, "steel": 0,
                      "arms": 0, "power": 1, "water": 1, "city": 1, "welfare": 0,
                      "optical": 0},
        "towers": [], "research": [],
        "cards": {k: {"count": 0, "level": 1} for k in TOWER_KINDS},
        "islands": ["main", "qeshm"], "security": 70, "hearts": 20,
        "wave": 1, "highestWave": 0,
        "phase": "peace", "mode": "campaign", "speed": 1, "layout": "landscape",
        "enemies": [], "pirates": [], "contraband": [],
        "merchants": [
            {"id": 1, "progress": 0.24, "kind": "bulk", "reward": 120, "paid": False},
            {"id": 2, "progress": 0.63, "kind": "container", "reward": 500, "paid": False},
        ],
        "shots": [], "popups": [],
        "spawnRemaining": 0, "spawnClock": 0, "spawnIndex": 0, "nextId": 3,
        "earlyBonus": False, "countdown": 15, "trafficClock": 0, "trafficCount": 0,
        "destroyed": 0, "elapsed": 0,
        "cooldowns": {"strike": 0, "emp": 0, "overdrive": 0}, "overdrive": 0,
        # On the enemy lane mid-strait; hydrateGame snaps to nearest water.
        "hero": {"x": 56.0, "y": 41.0, "active": 0}, "hero2": None,
        "towerStuns": {}, "challengeRule": 0, "chests": 0, "prestige": 0,
        "event": None, "eventClock": 0, "manualNight": False, "lastSavedAt": 0,
    }


def _enrich(state: dict) -> dict:
    """Ample resources + every island unlocked (for combat seeds)."""
    state.update(RICH_RESOURCES)
    state["islands"] = list(ALL_ISLANDS)
    return state


def _wave_ready(state: dict, wave: int) -> dict:
    """Battle starts on its own shortly after load (intermission + auto)."""
    state["phase"] = "intermission"
    state["countdown"] = 2
    state["idle"]["autoBattle"] = True
    state["wave"] = wave
    state["highestWave"] = max(state["highestWave"], wave - 1)
    state["hearts"] = 20
    return state


def tower(kind: str, slot: int, tier: int, branch=None, priority: str = "first") -> dict:
    return {"slot": slot, "kind": kind, "tier": tier, "branch": branch,
            "priority": priority}


def tower_config_seed(kind: str, tier: int, branch=None, wave: int = 3) -> dict:
    """One tower of the given configuration on its home strait slot,
    wave ready to start, ample resources."""
    if kind not in TOWER_KINDS:
        raise ValueError(f"unknown tower kind {kind!r}")
    if tier == 4 and branch not in (0, 1):
        raise ValueError("tier 4 requires branch 0 or 1")
    state = _enrich(base_state())
    state["towers"] = [tower(kind, HOME_SLOT[kind], tier, branch)]
    if tier == 4:
        state["research"] = ["special"]
    return _wave_ready(state, wave)


def tower_configs() -> list[tuple[str, int, object]]:
    """The 18 configurations: per family (tier 3), (tier 4, branch 0),
    (tier 4, branch 1)."""
    out = []
    for kind in TOWER_KINDS:
        out.append((kind, 3, None))
        out.append((kind, 4, 0))
        out.append((kind, 4, 1))
    return out


def tower_matrix_seed(wave: int = 3) -> dict:
    """All 18 configurations placed at once on 18 strait slots (visual QA)."""
    state = _enrich(base_state())
    state["research"] = ["special"]
    state["towers"] = [
        tower(kind, slot, tier, branch)
        for (kind, tier, branch), slot in zip(tower_configs(), MATRIX_SLOTS)
    ]
    return _wave_ready(state, wave)


def boss_seed(wave: int) -> dict:
    """Boss waves 5/10/15/20/25 with a ready tier-3 defense line."""
    if wave not in (5, 10, 15, 20, 25):
        raise ValueError("boss waves are 5/10/15/20/25")
    state = _enrich(base_state())
    state["research"] = ["special", "radar", "targeting"]
    state["towers"] = [
        tower("cannon", 2, 3), tower("heavy", 5, 3), tower("missile", 9, 3),
        tower("air", 12, 3), tower("ew", 8, 3), tower("boat", 4, 3),
        tower("missile", 10, 3), tower("heavy", 7, 3),
    ]
    return _wave_ready(state, wave)


def rich_economy_seed() -> dict:
    """Leveled buildings, hired managers, research, platforms, an active
    contract — the economy regression-lock fixture. Phase stays 'peace';
    the port tanker is at approach 0 so a measurement window sees pure
    production (no loading) until it berths (~25 game-sec)."""
    state = _enrich(base_state())
    state.update({"cash": 50000, "oil": 800, "fuel": 900, "steel": 1200,
                  "ammo": 2500, "security": 70})
    state["buildings"] = {"oil": 12, "tank": 20, "dock": 8, "refinery": 6,
                          "steel": 5, "arms": 5, "power": 8, "water": 5,
                          "city": 4, "welfare": 3, "optical": 4}
    state["research"] = ["drill", "pipe", "refine", "ammo", "dockauto",
                         "tanktech", "seabed", "industrial", "reserve",
                         "titanium", "radar", "special", "targeting",
                         "smart", "trade", "coastguard", "logistics"]
    idle = state["idle"]
    idle["managerLevels"] = {"harbor": 2, "energy": 2, "supply": 1}
    idle["managerClock"] = 9.5  # harbor auto-collect fires inside any window
    idle["xp"] = 2500
    idle["bank"] = 4000
    idle["boostCharges"] = 3
    idle["platforms"] = [0, 1, 4]
    idle["contract"] = {"id": "regional", "elapsed": 30}
    idle["claimedMissions"] = ["first-profit", "oil-five", "busy-port"]
    idle["stars"] = {"1": 3, "2": 3, "3": 2}
    state["highestWave"] = 4
    return state


def fresh_player_seed() -> dict:
    """A brand-new player: exactly initialGame()."""
    return base_state()


def parked_enemies(count: int = 15, hp: int = 100000,
                   first_id: int = 900) -> list[dict]:
    """Fat destroyers parked (perma-stunned) DENSELY along the whole enemy
    lane — a permanent engagement target for cadence measurement. The
    spread (0.10..0.94) guarantees at least one hull inside even the
    shortest tower range (EW ~19.5) of every strait slot; with the sparse
    mid-strait set, far slots (Bandar Abbas, Qeshm EW) never engaged.
    Towers still target stunned enemies; stun only stops movement."""
    progresses = [0.10 + 0.06 * i for i in range(15)]
    return [
        {"id": first_id + i, "kind": "destroyer", "boss": 0, "hp": hp,
         "maxHp": hp, "progress": progresses[i % len(progresses)],
         "stun": 99999, "specialClock": 0, "hitFlash": 0}
        for i in range(count)
    ]


def seed_js(state: dict) -> str:
    """JS that installs `state` as the save (proven pattern): overwrite the
    key with the original setItem, stamp lastSavedAt, then lock setItem to a
    no-op for the key so the running page cannot overwrite it pre-reload."""
    payload = json.dumps(state)
    return (
        "() => {"
        f"  const g = {payload};"
        "  g.lastSavedAt = Date.now();"
        "  const orig = Storage.prototype.setItem;"
        f"  orig.call(localStorage, '{SAVE_KEY}', JSON.stringify(g));"
        "  Storage.prototype.setItem = function (k, v) {"
        f"    if (k === '{SAVE_KEY}') return;"
        "    return orig.call(this, k, v);"
        "  };"
        "  return 'seeded';"
        "}"
    )


def mutated(state: dict, **overrides) -> dict:
    """Deep-copied state with top-level overrides (probe convenience)."""
    out = copy.deepcopy(state)
    out.update(overrides)
    return out
