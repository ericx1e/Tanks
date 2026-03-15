// Tank Game Wiki

const DOCS = {
    updatedAt: Date.now(),
    pages: {
        "overview": {
            title: "Overview",
            meta: "Game modes · Buffs · Combat basics",
            body: `
# Overview
**Tank Game** is a top-down multiplayer battler built around ricochets, fog of war, and fast-paced teamwork. You pilot a tank across maze-like arenas, fight waves of AI or other players, and collect buff chests to grow stronger over the course of a run.

## Game Modes

**Campaign** — Team up to clear waves of increasingly difficult AI tanks. Players share vision, buffs carry between waves, and fallen teammates respawn at the start of the next wave. Coordination matters.

**Arena** — PvP. Everyone starts equal; the last player or team standing wins. Chests spawn during the match — controlling them is often the deciding factor.

**Survival** — Hold out against endlessly spawning AI waves on a fixed map. Enemies get tougher every ten cycles. The game ends when all players are eliminated; there is no final wave.

**Endless** — Procedurally generated maps that loop forever. Like Campaign, but the maps are unique every level and scale in size. Buffs accumulate across the entire run. The goal is simply to go as far as possible.

## Core Loop
Move with **WASD**, aim with the mouse, and click to fire. Eliminate enemies. Collect buff chests from fallen foes. Survive the next wave. Repeat.

## What Makes It Interesting
Bullets ricochet off walls. Your shots can destroy incoming enemy bullets (parrying). Fog of war means you rarely have full information. Buffs compound — a few well-chosen upgrades reshape how you play.
`
        },

        "campaign": {
            title: "Campaign Mode",
            meta: "Waves · AI Enemies · Team Progression",
            body: `
# Campaign Mode
Clear each wave of enemy tanks as a team. Difficulty climbs steadily — early waves are manageable with basic play; later waves demand coordination, buff choices, and good positioning.

## Objective
Eliminate all enemies on the map. When the wave is clear, a brief transition gives the team time to collect any remaining chests before the next wave loads.

## Respawns
Players who die during a wave are out until the wave ends. If at least one teammate survives, dead players respawn for the next wave. If everyone dies, the run ends.

## Chests and Buffs
Killing an enemy has a chance to drop a chest. Walk over it to collect a random upgrade — see **Buffs and Upgrades** for the full list. Chests expire after a short time and are single-use, so coordinate with teammates.

## Tips
- Spread out to uncover more of the map under fog of war.
- Call out high-threat enemy tiers (Intelligence, Titan, Rusher) and prioritize them together.
- Balance buff picks across the team — stacking all max bullets on one player is usually weaker than spreading useful upgrades.
- Peek from corners and retreat — avoid standing in the open while multiple enemies have line of sight.
`
        },

        "arena": {
            title: "Arena Mode",
            meta: "PvP · Fog of War · Chest Control",
            body: `
# Arena Mode
Straight PvP. Every player starts with the same stats; the difference is aim, movement, and chest timing.

## Objective
Be the last player (or team) alive. No respawns — when you die, you spectate.

## Environment
Arenas are compact compared to Campaign maps, with walls and corridors that reward corner-peeking and limit long sightlines. Fog of war is personal in solo Arena; in team variants, allies share vision.

## Chests
Chests spawn at fixed intervals during the match. They grant the same upgrades as Campaign. Controlling central or contested chest spawns is often more valuable than individual kills — a player who denies upgrades while farming their own is building a compounding advantage.

## Playing Well
- Avoid predictable straight-line movement; strafe and change direction frequently.
- Use walls to break line of sight after firing — don't give enemies a stationary target.
- Speed and Shield are strong early picks. Multi-Shot and Bouncing Bullets become threatening mid-game when you can force engagements at close range.
- Learn chest spawn timing so you can contest them without overextending.
`
        },

        "survival": {
            title: "Survival Mode",
            meta: "Endless waves · Escalating tiers · Score",
            body: `
# Survival Mode
Hold a fixed map against continuously spawning AI. Waves arrive every few seconds; every ten cycles the enemy tier cap increases, introducing progressively tougher enemies.

## How It Works
Three enemies spawn roughly every five seconds. The game never stops — your objective is to survive as long as possible and push the tier cap as high as you can.

## Key Differences from Campaign
- The map does not change between waves.
- There is no transition period between groups — enemies keep coming.
- No respawns. If all players die, the run ends.
- Buffs accumulate across the entire session.

## Tips
- Mobility is the most reliable survival tool. Speed and Bullet Speed help you kite enemies who would otherwise surround you.
- Vision Range lets you spot threats earlier and gives Auto-Turret more time to lock on.
- Auto-Turret and Piercing are strong late-game picks when enemy density becomes unmanageable.
- Do not cluster — if bots converge on one point, multiple players take damage simultaneously.
`
        },

        "endless": {
            title: "Endless Mode",
            meta: "Procedural maps · Infinite levels · Buff stacking",
            body: `
# Endless Mode
A never-ending gauntlet of procedurally generated maps. No final level — the goal is to go as far as possible and see how powerful a buff loadout you can build.

## How It Works
Each level is a unique BSP-generated maze. Maps grow larger and more complex as the level number climbs. Clear all enemies to advance. Dead players revive at the start of each new level. Buffs carry over indefinitely.

## Why Endless Is Different
Endless is the only mode where long-term buff compounding matters. By level 20+, a well-built team with stacked upgrades handles enemy density that would be overwhelming at level 1. Choosing buffs with a long-run strategy — rather than what helps the current wave — is what separates good Endless runs from great ones.

## Recommended Approach
- Speed and Shield are safe early picks that keep you alive long enough to stack further.
- Auto-Turret compounds over time — the more enemies there are, the more effective it becomes.
- Bouncing Bullets combined with Multi-Shot is particularly effective in the narrow BSP corridors Endless generates.
- Coordinate buff picks across the team. One player focusing on survivability while others build damage is often stronger than everyone taking the same upgrades.
`
        },

        "buffs": {
            title: "Buffs & Upgrades",
            meta: "All 9 upgrades · Stack effects · Strategy",
            body: `
# Buffs & Upgrades
Buffs drop as glowing chests when enemies are killed. Walk over a chest to collect it. Each buff can be stacked — effects scale with diminishing returns (roughly square-root based), so the first few stacks of a buff matter significantly more than later ones.

---

## Speed Boost
Increases your maximum movement speed.

Each stack adds roughly 12% speed (sqrt-scaled). Faster tanks are harder to hit, better at chasing chests, and more capable of disengaging from bad positions. Useful in every mode and synergizes with almost everything.

---

## Max Bullets
Reduces the cooldown between shots and increases your maximum bullet count.

Each stack cuts cooldown and raises how many bullets you can have active simultaneously. Eventually your fire becomes near-continuous. Best paired with Multi-Shot or Bullet Speed for maximum pressure.

---

## Bullet Speed
Shots travel faster and farther before expiring.

Makes leading moving targets easier and extends effective range. Particularly strong in PvP where opponents can dodge slow projectiles, and in Survival where enemies approach from long range.

---

## Multi-Shot
Fires additional projectiles per shot in a spread pattern.

Each stack adds more simultaneous bullets. Devastating at close range; in tight corridors the spread is nearly unavoidable. Pairs lethally with Bouncing Bullets — ricocheting spread shots can fill a room.

---

## Bouncing Bullets
Your shots ricochet off walls.

Each stack adds more bounces per bullet. Opens up geometry-based plays around corners and lets you threaten enemies who believe they have cover. Most effective in Campaign and Endless where BSP corridors create natural ricochet lanes.

---

## Shield
Grants one shield charge that absorbs the next hit.

Collecting a shield buff immediately activates a charge. Multiple stacks queue additional charges, displayed above your tank. Shields absorb hits one at a time — they do not reduce damage from a single hit. Essential for surviving encounters with Titan and Phantom tier enemies.

---

## Vision Range
Expands your fog-of-war sight radius.

Each stack multiplies vision distance by roughly 1 + 0.3 × sqrt(stacks). Useful for spotting threats before they close in and for supporting Auto-Turret, which needs visible targets to fire at. Especially valuable in Survival on large maps.

---

## Piercing
Bullets pass through multiple enemies before stopping.

Piercing count scales with sqrt(stacks). A single shot can damage an entire column of enemies — transformative when fighting dense groups in Survival or late Endless. Pairs well with Max Bullets and Multi-Shot.

---

## Auto-Turret
Adds a secondary mini-turret on top of your tank that independently targets and fires at nearby enemies.

The turret rotates toward the nearest visible enemy and fires on its own cooldown. More stacks increase turret speed and fire rate. You focus on movement and positioning; the turret handles aim. Becomes increasingly powerful in later Endless and Survival levels as enemy count rises.
`
        },

        "bots": {
            title: "Enemy Types",
            meta: "All tiers · Behavior · Counters",
            body: `
# Enemy Types
Enemy tanks appear in Campaign, Survival, and Endless modes. Each tier has distinct movement speed, fire behavior, and special traits. Higher tiers are introduced as difficulty scales.

---

## Tier 0 — Rookie
Slow movement, sluggish turret rotation, long pauses between shots. The easiest enemy type and the one you will see earliest. Push aggressively and exploit their hesitation.

## Tier 1 — Grunt
Standard speed, aim, and fire rate. Dangerous primarily in numbers — isolate them one at a time and avoid getting cornered.

## Tier 2 — Marksman
Long-range accuracy with fast bullets but a slower fire rate. Punishes predictable straight movement. Strafe unpredictably and break line of sight frequently.

## Tier 3 — Burster
Fast-moving tank that fires in short, rapid bursts followed by a reload pause. Bait the burst from cover, then push while it resets.

## Tier 4 — Enforcer
Quick and rapid-fire, starts with one shield charge. Strip the shield from cover before committing, then rush together with teammates.

## Tier 5 — Beamer
Slow mover with a long-range laser that deals periodic damage. Zoning enemy — it denies corridors effectively. Break line of sight and rotate behind cover during beam uptime.

## Tier 6 — Trishot
Fast movement with a triple-shot spread, starts with one shield. Deadly at close range. Keep distance and approach diagonally to avoid the full spread pattern.

## Tier 7 — Spammer
Slower movement but very high fire rate, flooding bullets across open lanes. Swing wide around it, then punish when it pauses to reset aim.

## Tier 8 — Phantom
Fast mover that periodically cloaks — becoming nearly invisible for several seconds before reappearing. Starts with one shield. Watch for bullet trails and movement audio; fire where you last saw it.

## Tier 9 — Shield Tank
Deploys a front-facing bullet wall that physically blocks incoming shots and rotates toward the nearest player. Nearly immune from the front. Circle wide to hit from the side or rear; coordinated flanking from multiple angles works best.

## Tier 10 — Titan
Slow and massive, fires a triple-shot spread at the highest fire rate of any enemy. Starts with three shields. Stay mobile, whittle shields from distance, and avoid its close-range kill zone.

## Tier 11 — Rusher
Very fast, single-minded hunter that charges directly at the nearest player. Closes gaps instantly and punishes slow reactions. Keep walls between you and it; kite in open space and shoot as it charges.

## Tier 12 — Intelligence
The fastest enemy in the game. Omniscient — detects your position without line of sight, flanks effectively, and leads shots with precision. Starts with one shield. Move unpredictably, use corners to break its shot leads, and prioritize it as soon as it appears.

## Tier 13 — Laser Pulse
Medium speed with a short-range repeating laser. Starts with one shield. The laser bypasses bullet-to-bullet parrying. Play outside its effective range and punish between pulse cycles.

---

## General Advice
- Strafe and stutter-step to break enemy aim rhythm.
- Peek diagonally from corners; avoid standing straight in a doorway.
- Prioritize high-pressure tiers first: Intelligence, Titan, and Rusher demand immediate attention.
- Grab Speed and Shield chests before committing to large group fights.
`
        },

        "mechanics": {
            title: "Core Mechanics",
            meta: "Movement · Vision · Minimap · Combat",
            body: `
# Core Mechanics

## Movement
Tanks have momentum — you accelerate into movement and slide slightly when changing direction. Short, deliberate movements are more controllable than holding a direction and hoping. Use momentum to dodge, not just to travel.

## Vision and Fog of War
Fog of war hides areas outside your sight radius. You only see what your tank can directly observe.

- In Campaign and Survival, teammates share vision — spread out to uncover more of the map.
- In Arena, fog is personal — use it to set up ambushes and deny enemy information.
- Press **F** to toggle fog on and off (useful for spectating or testing).
- Press **V** to switch between standard and high-quality raycast resolution.

## Minimap
A minimap appears in the bottom-left corner during play. Tiles you have explored are shown; unexplored areas remain dark. It resets each new level so exploration remains meaningful.

## Bullets and Collision
- Bullets travel in a straight line until they hit a wall or tank.
- With Bouncing Bullets, shots ricochet off walls for additional bounces.
- Enemy bullets can be destroyed by your own bullets — this is called a parry. Timing a shot to intercept an incoming projectile is a core defensive skill.
- Piercing bullets pass through multiple tanks before stopping.
- Lasers deal damage on contact and cannot be parried by bullets.

## Shields
A shield absorbs one hit and then breaks. Shield charges queue up if you collect multiple shield buffs. The count is displayed above your tank. Shields do not reduce damage; they block it entirely, one hit at a time.

## Respawns
- **Campaign and Endless:** Players revive at the start of the next wave or level if at least one teammate survived.
- **Arena:** No respawns. Eliminated players spectate until the match ends.
- **Survival:** No respawns. The run ends when all players are eliminated.
`
        },

        "classes": {
            title: "Tank Classes",
            meta: "7 classes · Stat differences · Abilities",
            body: `
# Tank Classes
Choose a class before the game begins by shooting the corresponding dummy tank in the lobby. Your class determines your base stats and, for some classes, grants a special ability.

Classes are selected per-lobby and persist until you change them. Your last selection is remembered between sessions.

---

## Assault
The baseline class. Balanced speed, fire rate, and bullet speed. No special ability. Good for players learning the game or who prefer straightforward play.

## Scout
Faster movement and a wider vision radius than Assault, but reduced bullet damage. Best for players who want to gather information, reach chests first, and dictate positioning.

## Sniper
Slower movement and fire rate, but significantly higher bullet speed and damage per shot. Excels at long corridors where it can pick off enemies before they close the gap. Less effective in tight BSP mazes.

## Guardian
Reduced speed, but starts with extra shield charges and takes reduced damage per hit. Designed to absorb punishment during chaotic fights. Pairs well with Piercing or Auto-Turret buffs so the turret works while you tank hits.

## Engineer
Moderate stats across the board with improved buff drop rates from kills. Engineer players collect upgrades faster over the course of a run, making them stronger in later waves. Less impactful in short sessions like Arena.

## Laser
Has access to a laser ability on a cooldown (roughly 5 seconds). Trigger it by holding the fire button while moving. The laser deals rapid contact damage and bypasses bullet parrying. Standard bullet stats are slightly reduced to compensate.

## Gunner
Higher fire rate and bullet cap than Assault, but slower movement and reduced bullet speed. Designed for mid-range suppression and multi-shot builds. Struggles against fast enemies that close distance quickly.
`
        },

        "tips": {
            title: "Tips & Tricks",
            meta: "Practical advice for all modes",
            body: `
# Tips & Tricks

## Movement
- Micro-adjust your path constantly — even small deviations make you significantly harder to hit.
- Use momentum when dodging: anticipate where you need to be, not just where you are.
- Stutter-step (tap movement keys briefly) to throw off enemy aim without sacrificing position.

## Combat
- Peek from corners diagonally, not straight through doorways. Fire, then immediately retreat.
- Use bullets to parry incoming shots — intercepting a fast projectile with your own is often safer than dodging.
- Fire slightly ahead of moving targets, especially at range. Slow bullets are easy to dodge; pair Bullet Speed with Max Bullets if you want reliable hits.

## Chests and Buffs
- Collect chests before committing to a fight, not after — a shield or speed upgrade might decide the engagement.
- In team modes, coordinate buff picks. Three players all taking Multi-Shot is usually weaker than distributing Speed, Multi-Shot, and Shield across the team.
- In Arena, denying an opponent a chest is nearly as valuable as taking it yourself.

## Mode-Specific
- **Campaign and Endless:** Call out and focus high-threat enemies immediately — Intelligence, Titan, and Rusher left alive too long will collapse your team.
- **Arena:** Learn chest spawn timing. Rotating for chests while maintaining map awareness separates consistent Arena players from streaky ones.
- **Survival:** Prioritize Speed and Vision Range early. Mobility and awareness compound in value as enemy density increases; raw damage buffs are weaker until you have enough survivability to actually use them.

## Auto-Turret
Auto-Turret fires independently while you focus on movement. Stack it alongside Vision Range (so it has visible targets) and Piercing (so each turret shot damages multiple enemies). In late Endless, a well-built Auto-Turret setup essentially handles dense rooms on its own.
`
        }
    },

    nav: [
        {
            label: "Start Here", items: [
                { label: "Overview", slug: "overview" },
                { label: "Core Mechanics", slug: "mechanics" },
            ]
        },
        {
            label: "Game Modes", items: [
                { label: "Campaign", slug: "campaign" },
                { label: "Arena", slug: "arena" },
                { label: "Survival", slug: "survival" },
                { label: "Endless", slug: "endless" },
            ]
        },
        {
            label: "Gameplay", items: [
                { label: "Tank Classes", slug: "classes" },
                { label: "Buffs & Upgrades", slug: "buffs" },
                { label: "Enemy Types", slug: "bots" },
                { label: "Tips & Tricks", slug: "tips" },
            ]
        }
    ]
};
