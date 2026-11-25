# Neon Arcade Slots (SLOP-MACHINE)

A modern retro arcade slot machine web game built with vanilla HTML5, CSS3, and JavaScript.

## Live Demo
Deployable directly on Vercel or any static web host.

## Features (Stage 1)
- Modern Retro Arcade Casino theme (neon, gold, and purple accents)
- 100% custom SVG icons and graphics (strictly zero emojis)
- 7 interactive navigation sections:
  - Game
  - Machines
  - Collection
  - Achievements
  - Missions
  - Statistics
  - Profile
- Modal and Toast notification systems
- Responsive desktop, tablet, and mobile layouts

## Features (Stage 4) — XP, Levels, Achievements & Collections
- New `js/progression.js` module (XP, levels, achievements, collections, persistence)
- XP formula (approved): +5 per completed spin, +15 win bonus, +50 jackpot bonus
- Level curve: XP needed = `100 × L × (L−1)` (L1: 0 → L2: 200 → L3: 600 → …); multiple level-ups per award
- Virtual-coin level-up rewards via `Economy.addBalance()` (configurable `LEVEL_REWARDS`)
- Achievements: First Spin, First Win, Getting Started (10 spins), Dedicated Player (100 spins), Jackpot!, Collector (5 symbols), Level 10 (+ Prestige I shell)
- Collections: all 7 game symbols, discovery per completed spin, completion reward (Gold Star Badge)
- LocalStorage persistence for progression data (safe on corrupt/missing data)

## Local Development
Simply open `index.html` in any modern web browser or serve via any static HTTP server.

## AI Assistance

This project was developed with the assistance of AI tools for brainstorming, implementation, debugging, and code refinement. All generated code and suggestions were reviewed and integrated into the project during development.
