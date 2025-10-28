// Tank Game Wiki — Player Edition (Campaign & Arena; fixed sub-bullet rendering with <br>)

const DOCS = {
    updatedAt: Date.now(),
    pages: {
        'overview': {
            title: 'Overview',
            meta: 'Game modes · Progression · Strategy',
            body: `
# Welcome
**Tank Game** is a fast-paced multiplayer battler. Open **🎁 chests** for upgrades, outmaneuver enemies, and control the map.

Two main experiences:
- **Campaign Mode** — Cooperate against waves of **AI tanks**.
- **Arena Mode** — PvP showdowns that reward aim, movement, and smart chest timing.

Win by combining awareness, quick pickups, and clean engagements.
`
        },

        'campaign': {
            title: 'Campaign Mode',
            meta: 'Waves · AI Enemies · Team Progression',
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
- 🔄 **Bouncing Bullets** — shells can ricochet off walls.  
- 🛡️ **Shield** — temporary barrier that absorbs damage.

Chests **expire** and are **one-use** — coordinate with teammates so everyone powers up.

## Team Tips
- Spread out to reveal more of the map under fog.  
- Use cover, peek to shoot, and rotate for chests between skirmishes.  
- Balance upgrades so the team stays strong across waves.
`
        },

        'arena': {
            title: 'Arena Mode',
            meta: 'PvP · Fog of War · Power Chests',
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
- **Rotate for chests** when it’s safe; don’t overextend.  
- Choose upgrades that fit your plan: ⚡ speed for flanks, 🛡️ shield for duels, 🔁 multi-shot for burst.
`
        },

        'bots': {
            title: 'Bot Behavior',
            meta: 'Campaign-only · Tiers · How to counter',
            body: `
# Bot Behavior (Campaign Only)
Enemy tanks appear **only in Campaign**. They have **distinct colors**, share similar instincts (like **dodging incoming shots**), and each **tier** specializes in a different combat style.  
They reposition around walls, pressure you when exposed, and back off under heavy fire.

## Bot Tiers — Know Your Foes

- **Tier 0 — Rookie**  
  🟦 **Style:** Slow movement, sluggish turret tracking, and long pauses between shots.<br>
  🎯 **Threat:** Low — ideal warm-up targets.<br>
  🧠 **Counter:** Push confidently; punish their hesitation.

- **Tier 1 — Grunt**  
  🟩 **Style:** Standard speed, aim, and fire rate.<br>
  🎯 **Threat:** Moderate, dangerous in numbers.<br>
  🧠 **Counter:** Don’t get cornered; isolate one at a time.

- **Tier 2 — Marksman**  
  🟨 **Style:** Long-range accuracy and **fast bullets**, but slower fire rate.<br>
  🎯 **Threat:** High at distance — punishes straight movement.<br>
  🧠 **Counter:** Strafe unpredictably; break line of sight often.

- **Tier 3 — Burster**  
  🟧 **Style:** Fast-moving tank that fires in **short bursts** of shots.<br>
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

## General Advice
- **Strafe and stutter-step** to break their aim rhythm.<br>
- **Peek diagonally** from corners; avoid straight lines.<br>
- **Prioritize high-pressure tiers** first (Trishot, Enforcer, Marksman).<br>
- **Grab 🛡️ and ⚡ chests** before engaging large groups.
`
        },

        'mechanics': {
            title: 'Core Mechanics',
            meta: 'Movement · Vision · Combat basics',
            body: `
# Core Mechanics

## Movement
Tanks have momentum — accelerate into fights and **slide out** of danger.  
Short bursts and clean turns keep you alive.

## Vision
**Fog of war** hides areas outside your view radius.  
In Campaign, teammates share vision; in Arena, use fog to set up ambushes.

## Combat
- Projectiles collide with walls and tanks; with 🔄 **Bouncing Bullets**, they can ricochet.  
- 🛡️ **Shield** absorbs damage until it breaks.  
- Explosions and trails help track ongoing battles.

## Respawns
- **Campaign:** Revive between waves if the squad survives.  
- **Arena:** No respawns — spectate until the match ends.
`
        },

        'tips': {
            title: 'Tips & Tricks',
            meta: 'Advice for mastering both modes',
            body: `
# Tips & Tricks
- **Keep moving** — micro-adjust your path to dodge shots.  
- **Peek wisely** — fire from corners, then duck back.  
- **Chest timing** — take upgrades before key fights; don’t let 🎁 expire.  
- **Matchups:** ⚡ speed beats slow aimers, 🛡️ shield blunts burst, 🔁 multi-shot rules mid-range.  
- **Campaign:** Call out tiers; focus the most dangerous first.  
- **Arena:** Deny center chests and punish distracted players from the fog.
`
        }
    },

    nav: [
        {
            label: 'Start Here', items: [
                { label: 'Overview', slug: 'overview' },
            ]
        },
        {
            label: 'Game Modes', items: [
                { label: 'Campaign Mode', slug: 'campaign' },
                { label: 'Arena Mode', slug: 'arena' },
            ]
        },
        {
            label: 'Gameplay', items: [
                { label: 'Bot Behavior', slug: 'bots' },
                { label: 'Core Mechanics', slug: 'mechanics' },
                { label: 'Tips & Tricks', slug: 'tips' },
            ]
        }
    ]
};
