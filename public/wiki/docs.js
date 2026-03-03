// Tank Game Wiki — Player Edition

const DOCS = {
    updatedAt: Date.now(),
    pages: {
        "overview": {
            title: "Overview",
            meta: "Game modes · Progression · Strategy",
            body: `
# Welcome
**Tank Game** is a fast-paced multiplayer battler. Open **🎁 chests** for upgrades, outmaneuver enemies, and control the map.

Four main experiences:
- **Campaign** — Cooperate against waves of increasingly tough **AI tanks**.
- **Arena** — PvP showdowns that reward aim, movement, and smart chest timing.
- **Survival** — Endless bot waves with escalating difficulty; see how long you can last.
- **Endless** — Campaign levels that loop indefinitely.

Win by combining awareness, quick pickups, and clean engagements.
`
        },

        "campaign": {
            title: "Campaign Mode",
            meta: "Waves · AI Enemies · Team Progression",
            body: `
# Campaign Mode
Team up to clear **increasingly difficult waves** of enemy tanks.

## Objective
Defeat all enemies in each wave and survive through the full set of levels.

## Flow
- Start together, fight a wave, then brace for the next.
- Enemies scale in difficulty as you advance.
- If your squad survives, fallen players respawn for the next wave.

## 🎁 Chests & Upgrades
After fights, glowing **chests** appear. Open one to gain a random upgrade:

- ⚡ **Speed Boost** — move faster.
- 🔫 **Fire Rate** — shoot more frequently.
- 🚀 **Bullet Speed** — shots travel faster and farther.
- 🔁 **Multi-Shot** — fire multiple projectiles at once.
- 🔄 **Bouncing Bullets** — shells ricochet off walls.
- 🛡️ **Shield** — temporary barrier that absorbs one hit.
- 👁️ **Vision Range** — expands your fog-of-war sight radius.
- 🎯 **Piercing** — bullets pass through multiple enemies before stopping.
- 🤖 **Auto-Turret** — a secondary mini-turret that independently tracks and fires at nearby enemies.

Upgrades **stack** with diminishing returns — a few stacks of the right upgrade can define your playstyle.
Chests **expire** and are **one-use** — coordinate with teammates so everyone powers up.

## Team Tips
- Spread out to reveal more of the map under fog.
- Use cover, peek to shoot, and rotate for chests between skirmishes.
- Balance upgrades so the team stays strong across waves.
`
        },

        "arena": {
            title: "Arena Mode",
            meta: "PvP · Fog of War · Power Chests",
            body: `
# Arena Mode
Face off against other players until one side — or one survivor — remains.

## Objective
Outlast opponents using positioning, aim, and timely **🎁 chest** pickups.

## Environment
- Compact arenas with walls and cover.
- **Fog of war** limits visibility — you only see nearby areas (and allied vision in team Arena).

## Chest Strategy
Chests spawn during the match and grant the same upgrades as Campaign.
Control space to claim them safely — denying upgrades is as strong as taking them.

## PvP Tips
- **Lead shots** and use walls to break line of sight.
- **Rotate for chests** when it is safe; don't overextend.
- Choose upgrades that fit your plan: ⚡ speed for flanks, 🛡️ shield for duels, 🔁 multi-shot for burst.
`
        },

        "endless": {
            title: "Endless Mode",
            meta: "Procedural maps · Infinite levels · Buff stacking",
            body: `
# Endless Mode
A never-ending gauntlet of **procedurally generated maps** that keeps going as long as you survive.

## How It Works
- Each level is a unique **BSP-generated maze** — no two levels are the same.
- Levels get **larger and more complex** as the number climbs.
- Clear all enemies to advance to the next level. There is no final level.
- **Buffs carry over** between levels — your upgrades accumulate the entire run.
- Dead players **revive** at the start of each new level.

## Why Play Endless
- The only mode where stacking many buffs pays off across dozens of levels.
- Great for pushing upgrade combinations to their limit (e.g. max Auto-Turret + Piercing + Speed).
- Cooperative runs reward coordinated buff choices — split roles across the team.

## Tips
- ⚡ **Speed** and 🛡️ **Shield** are safe early picks to stay alive long enough to stack.
- 🤖 **Auto-Turret** becomes increasingly powerful as levels fill with enemies.
- 🔄 **Bouncing Bullets** combined with 🔁 **Multi-Shot** can clear tight corridors quickly.
- Prioritize staying alive over chest-hunting — your buffs reset on death.
`
        },

        "survival": {
            title: "Survival Mode",
            meta: "Endless waves · Escalating tiers · Score chase",
            body: `
# Survival Mode
Hold out as long as possible against **continuously spawning AI waves**.

## How It Works
- Bots spawn every **5 seconds** in groups of 3.
- Every 10 spawn cycles the **enemy tier cap increases**, bringing tougher enemies into the mix.
- The game never ends — the goal is to stay alive and push the tier cap as high as you can.

## Tips
- **Prioritize mobility upgrades** early (⚡ Speed, 🚀 Bullet Speed) — you will need to kite.
- 👁️ **Vision Range** helps spot enemies before they close in.
- 🤖 **Auto-Turret** and 🎯 **Piercing** shine when you are surrounded.
- Don't cluster — spread out so bots don't converge on a single point.
`
        },

        "buffs": {
            title: "Buffs & Upgrades",
            meta: "All 9 upgrades · Stack effects · Strategy",
            body: `
# Buffs & Upgrades
Buffs drop from defeated enemies as glowing **🎁 chests**. Walk over a chest to collect it. Each buff can be stacked — effects scale with **diminishing returns** (roughly square-root based), so a few stacks matter a lot, many stacks matter less.

---

## ⚡ Speed Boost
**Increases your maximum movement speed.**

Each stack adds ~12% speed (sqrt-scaled). Great in every mode — faster tanks are harder to hit and better at chasing chests.

*Best modes: All. Best combos: anything that benefits from chasing or escaping.*

---

## 🔫 Fire Rate
**Reduces the cooldown between shots and increases your bullet cap.**

Each stack cuts cooldown and raises how many bullets you can have in the air at once. Eventually your shots become near-continuous.

*Best modes: Survival, Endless. Best combos: Multi-Shot, Bullet Speed.*

---

## 🚀 Bullet Speed
**Shots travel faster and farther before expiring.**

Makes leading targets easier and extends effective range. Especially strong against fast-moving enemies or players.

*Best modes: Arena (PvP), Campaign. Best combos: Piercing, Multi-Shot.*

---

## 🔁 Multi-Shot
**Fires additional projectiles per shot in a spread pattern.**

Each stack adds more simultaneous bullets (sqrt-scaled). Devastating up close; in tight corridors it is nearly unavoidable.

*Best modes: Endless, Survival. Best combos: Bouncing Bullets, Fire Rate.*

---

## 🔄 Bouncing Bullets
**Your shots ricochet off walls.**

Each stack adds more bounces. Opens up geometry-based shots around corners, making bullets effective even when enemies have cover. Combines lethally with Multi-Shot in enclosed maps.

*Best modes: Campaign, Endless (tight BSP corridors). Best combos: Multi-Shot, Bullet Speed.*

---

## 🛡️ Shield
**Grants one shield charge that absorbs the next hit.**

Collecting a shield buff immediately activates a shield. Multiple stacks queue up as charges — the count displays above your tank. Shields do NOT stack to mitigate a single hit; they absorb hits one at a time.

*Best modes: All. Essential for: surviving Titan and Phantom encounters.*

---

## 👁️ Vision Range
**Expands your fog-of-war sight radius.**

Each stack multiplies vision distance by ~1 + 0.3 * sqrt(stacks). Useful for spotting threats early and coordinating in co-op where shared vision already covers a lot.

*Best modes: Survival (large maps), Endless. Best combos: Auto-Turret (turret needs visible targets).*

---

## 🎯 Piercing
**Bullets pass through multiple enemies before stopping.**

Piercing count scales with sqrt(stacks). A single shot can damage a whole column of enemies — transformative when fighting dense groups.

*Best modes: Survival, Endless. Best combos: Multi-Shot, Fire Rate, Bullet Speed.*

---

## 🤖 Auto-Turret
**Adds a secondary mini-turret on top of your tank that independently targets and fires at nearby enemies.**

The turret rotates toward the nearest enemy, fires on its own cooldown, and gets faster and more accurate with more stacks. You focus on movement; the turret handles aim.

*Best modes: Endless, Survival. Best combos: Vision Range (more targets visible), Fire Rate (turret benefits too), Piercing.*
`
        },

        "bots": {
            title: "Bot Behavior",
            meta: "Campaign & Survival · Tiers · How to counter",
            body: `
# Bot Behavior
Enemy tanks appear in **Campaign**, **Survival**, and **Endless** modes. They have **distinct colors**, dodge incoming shots, reposition around walls, and pressure you when exposed.

## Bot Tiers — Know Your Foes

- **Tier 0 — Rookie**
  🟦 **Style:** Slow movement, sluggish turret, long pauses between shots.<br>
  🎯 **Threat:** Low — ideal warm-up targets.<br>
  🧠 **Counter:** Push confidently; punish their hesitation.

- **Tier 1 — Grunt**
  🟩 **Style:** Standard speed, aim, and fire rate.<br>
  🎯 **Threat:** Moderate, dangerous in numbers.<br>
  🧠 **Counter:** Don't get cornered; isolate one at a time.

- **Tier 2 — Marksman**
  🟨 **Style:** Long-range accuracy and **fast bullets**, slower fire rate.<br>
  🎯 **Threat:** High at distance — punishes straight movement.<br>
  🧠 **Counter:** Strafe unpredictably; break line of sight often.

- **Tier 3 — Burster**
  🟧 **Style:** Fast-moving tank that fires in **short bursts**.<br>
  🎯 **Threat:** Heavy burst if caught off-guard.<br>
  🧠 **Counter:** Bait the burst, then push while it resets.

- **Tier 4 — Enforcer**
  🟪 **Style:** **Quick**, **rapid-fire**, starts with a 🛡️ shield.<br>
  🎯 **Threat:** High sustained damage at close-mid range.<br>
  🧠 **Counter:** Strip the shield from cover, then rush together.

- **Tier 5 — Beamer**
  🔵 **Style:** **Slow mover** with **long-range laser** that deals periodic damage.<br>
  🎯 **Threat:** Zone control and area denial.<br>
  🧠 **Counter:** Break line of sight; rotate behind cover during beam uptime.

- **Tier 6 — Trishot**
  🟠 **Style:** **Fast**, **triple-shot spread**, starts with a 🛡️ shield.<br>
  🎯 **Threat:** Deadly up close.<br>
  🧠 **Counter:** Keep range and fight diagonally to dodge the spread.

- **Tier 7 — Spammer**
  🟥 **Style:** **Slower movement** but **very high fire rate**, floods bullets across lanes.<br>
  🎯 **Threat:** Constant suppression.<br>
  🧠 **Counter:** Swing wide, then punish when it pauses to reset aim.

- **Tier 8 — Phantom**
  🌑 **Style:** **Fast** mover that **periodically cloaks** — becoming nearly invisible for several seconds before reappearing. Starts with a 🛡️ shield.<br>
  🎯 **Threat:** Hard to track; can vanish mid-fight and reposition.<br>
  🧠 **Counter:** Watch for bullet trails and listen for movement; fire where you last saw it.

- **Tier 9 — Shield Tank**
  🟦 **Style:** **Deploys a front-facing bullet wall** that physically blocks incoming shots. Rotates the shield toward the nearest player.<br>
  🎯 **Threat:** Nearly immune from the front; forces flanking.<br>
  🧠 **Counter:** Circle wide to hit from the side or rear; coordinated flanks from multiple angles are best.

- **Tier 10 — Titan**
  ⬛ **Style:** **Slow**, massive tank with **triple-shot spread** and the **fastest fire rate** of any enemy. Starts with **3 shields**.<br>
  🎯 **Threat:** Extreme burst potential — three shields means it takes punishment.<br>
  🧠 **Counter:** Stay mobile, whittle shields from distance, and avoid its kill zone at close range.

- **Tier 11 — Rusher**
  🔴 **Style:** **Very fast**, single-minded hunter that **charges directly at the nearest player** at all times.<br>
  🎯 **Threat:** Closes gaps instantly; punishes any slow reaction.<br>
  🧠 **Counter:** Keep walls between you and it; kite in open space and shoot as it charges.

- **Tier 12 — Intelligence**
  🤍 **Style:** The fastest enemy in the game. **Omniscient** — detects your position without line of sight. **Flanks**, **leads shots** precisely, and starts with a 🛡️ shield.<br>
  🎯 **Threat:** Extreme — it always knows where you are and predicts your path.<br>
  🧠 **Counter:** Move unpredictably; use corners to break its shot leads. Prioritize as soon as it appears.

- **Tier 13 — Laser Pulse**
  🔷 **Style:** **Medium speed** with a **short-range repeating laser**. Starts with a 🛡️ shield.<br>
  🎯 **Threat:** Dangerous at close quarters; laser bypasses bullet-to-bullet parrying.<br>
  🧠 **Counter:** Keep distance — the laser has short range; play outside it and punish between pulses.

## General Advice
- **Strafe and stutter-step** to break their aim rhythm.<br>
- **Peek diagonally** from corners; avoid straight lines.<br>
- **Prioritize high-pressure tiers** first (Intelligence, Titan, Rusher).<br>
- **Grab 🛡️ and ⚡ chests** before engaging large groups.
`
        },

        "mechanics": {
            title: "Core Mechanics",
            meta: "Movement · Vision · Minimap · Combat basics",
            body: `
# Core Mechanics

## Movement
Tanks have momentum — accelerate into fights and **slide out** of danger.
Short bursts and clean turns keep you alive.

## Vision & Fog of War
**Fog of war** hides areas outside your view radius.
- In Campaign and Survival, **teammates share vision**.
- In Arena, fog is personal — use it to set up ambushes.
- Press **F** to toggle fog on/off (useful for spectating or level design).
- Press **V** to switch between normal and high-quality raycast resolution.

## Minimap
A small **minimap** appears in the bottom-left corner during play.
- Tiles you have explored are shown; unexplored areas remain dark.
- Resets each new level so exploration stays meaningful.

## Combat
- Projectiles collide with walls and tanks; with 🔄 **Bouncing Bullets** they ricochet off walls.
- 🛡️ **Shield** absorbs one hit, then breaks.
- 🎯 **Piercing** bullets punch through multiple targets.
- Lasers deal damage on contact and ignore bullet-to-bullet parrying.
- Explosions and trails help track ongoing battles.

## Respawns
- **Campaign / Endless:** Revive between waves if the squad survives.
- **Arena:** No respawns — spectate until the match ends.
- **Survival:** No respawns — the game ends when all players are eliminated.
`
        },

        "tips": {
            title: "Tips & Tricks",
            meta: "Advice for mastering all modes",
            body: `
# Tips & Tricks
- **Keep moving** — micro-adjust your path to dodge shots.
- **Peek wisely** — fire from corners, then duck back.
- **Chest timing** — take upgrades before key fights; don't let 🎁 expire.
- **Matchups:** ⚡ speed beats slow aimers, 🛡️ shield blunts burst, 🔁 multi-shot rules mid-range.
- **Auto-Turret** is best when you are kiting — it fires independently while you focus on movement.
- **Piercing** multiplies in value against tight groups; stack it in Survival for crowd control.
- **Campaign / Endless:** Call out tiers; focus Intelligence and Titan first.
- **Arena:** Deny center chests and punish distracted players from the fog.
- **Survival:** Prioritize ⚡ Speed and 👁️ Vision early — mobility and awareness outlast raw firepower.
`
        }
    },

    nav: [
        {
            label: "Start Here", items: [
                { label: "Overview", slug: "overview" },
            ]
        },
        {
            label: "Game Modes", items: [
                { label: "Campaign Mode", slug: "campaign" },
                { label: "Arena Mode", slug: "arena" },
                { label: "Survival Mode", slug: "survival" },
                { label: "Endless Mode", slug: "endless" },
            ]
        },
        {
            label: "Gameplay", items: [
                { label: "Buffs & Upgrades", slug: "buffs" },
                { label: "Bot Behavior", slug: "bots" },
                { label: "Core Mechanics", slug: "mechanics" },
                { label: "Tips & Tricks", slug: "tips" },
            ]
        }
    ]
};
