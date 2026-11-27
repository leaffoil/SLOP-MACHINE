# SLOP-MACHINE

A browser-based slot machine prototype built to experiment with **UI design, animations, and interactive audio**.

<p align="center">
  <a href="https://slopmachine-wheat.vercel.app/">
    <strong>▶ Play SLOP-MACHINE</strong>
  </a>
</p>

## Overview

SLOP-MACHINE is an experimental frontend project focused on creating a polished arcade-style slot machine experience.

The primary objective was to explore how interface design, reel animations, and synchronized sound effects work together to create a satisfying interactive experience.

This is intentionally a prototype rather than a full-fledged game. Progression systems are present as basic gameplay experiments, but there is no substantial progression depth, long-term economy, or backend infrastructure.

## Features

- **Slot Machine Gameplay** - Three-reel spinning system with symbol combinations and payouts.
- **Animated Reels** - Sequential reel stopping, spinning effects, and visual feedback.
- **Interactive Betting** - Adjustable bets with minimum, maximum, and configurable increments.
- **Auto Spin** - Automated consecutive spins with adjustable controls.
- **Sound Design** - Browser-based audio effects synchronized with gameplay.
- **Dynamic Audio** - Subtle pitch variations to make repeated sound effects feel less repetitive.
- **Multiple Machine Themes** - Classic, Treasure, and Cyber machine designs.
- **Experimental Progression UI** - Basic levels, achievements, collections, missions, and statistics.

## Mathematical Odds

The slot machine uses weighted random symbol selection. Each reel independently selects a symbol, and only the middle row is evaluated for payouts.

All three machine themes share the same probability distribution and payout multipliers. Their differences are cosmetic.

### Symbol Probabilities

| Symbol Type | Weight | Probability | Payout |
|---|---:|---:|---:|
| Cherry / Coin / Chip | 30 | 30% | 2× |
| Lemon / Gem / Data | 25 | 25% | 3× |
| Watermelon / Chest / Robot | 20 | 20% | 5× |
| Diamond / Crown / Laser | 12 | 12% | 10× |
| Star / Sapphire / Hologram | 8 | 8% | 15× |
| Seven / Treasure / Core | 3 | 3% | 50× |
| Wild | 2 | 2% | Special |

Total symbol weight: **100**

### Winning Odds

Wild symbols can substitute for regular symbols to complete a matching combination. Three Wilds trigger the jackpot.

| Winning Combination | Payout | Probability | Approximate Odds |
|---|---:|---:|---:|
| Three Cherry-type | 2× | 3.276% | 1 in 30.53 |
| Three Lemon-type | 3× | 1.9675% | 1 in 50.83 |
| Three Watermelon-type | 5× | 1.064% | 1 in 93.98 |
| Three Diamond-type | 10× | 0.2736% | 1 in 365.50 |
| Three Star-type | 15× | 0.0992% | 1 in 1,008.06 |
| Three Seven-type | 50× | 0.0117% | 1 in 8,547 |
| Three Wilds (Jackpot) | 500× | 0.0008% | 1 in 125,000 |

### Overall Statistics

| Metric | Value |
|---|---:|
| Any Winning Combination | 6.6928% |
| Ordinary Win Probability | 6.6920% |
| Jackpot Probability | 0.0008% |
| Loss Probability | 93.3072% |
| Overall Win Odds | 1 in 14.94 |
| Jackpot Odds | 1 in 125,000 |

### RTP and House Edge

RTP (Return to Player) represents the theoretical percentage of wagered coins returned through slot payouts over a very large number of spins.

The theoretical RTP is calculated using the probability of each outcome multiplied by its payout:

\[
RTP = \sum_{i=1}^{n} P_i \times R_i \times 100
\]

Where:
- \(P_i\) = Probability of an outcome.
- \(R_i\) = Gross payout multiplier.

| Metric | Classic | Treasure | Cyber |
|---|---:|---:|---:|
| Theoretical RTP | 22.9835% | 22.9835% | 22.9835% |
| House Edge | 77.0165% | 77.0165% | 77.0165% |

The house edge is calculated as:

\[
House\ Edge = 100\% - RTP
\]

**Important:** These figures describe slot payouts only. Progression rewards and mission rewards are separate coin sources and are not included in the RTP calculation.

The current configuration is intentionally experimental and is not balanced for a realistic long-term slot economy.

### Betting Rules

- Minimum bet: 10 coins.
- Maximum bet: 100 coins.
- Configurable betting increments.
- Wagers are deducted when a spin begins.
- Winning payouts are credited after the spin completes.
- Payout multipliers represent gross returns, not net profit.

Changing the bet amount affects the number of coins won or lost, but does not change the probability of winning or the theoretical RTP.

## Project Scope

This project was primarily developed as a frontend experimentation exercise.

**What it focuses on:**
- UI/UX design and visual consistency.
- CSS animations and JavaScript-driven reel movement.
- Audio implementation using the Web Audio API.
- Synchronization between gameplay events, animations, and sound.
- Responsive interface design.
- Interactive browser-based components.

**What it does not aim to provide:**
- Deep progression or a balanced long-term economy.
- A backend or server-side game architecture.
- User accounts or authentication.
- Cloud saves or cross-device synchronization.
- Multiplayer functionality.
- Persistent server-side player statistics.

Any locally stored game data is browser-dependent and is not synchronized with a server.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Styling, layouts, and animations |
| JavaScript | Game logic and interactions |
| Web Audio API | Sound generation and playback |
| LocalStorage | Local browser data persistence |
| Vercel | Deployment and hosting |

No backend or database is required. The application runs entirely in the browser.

## Running Locally

Clone the repository:

```bash
git clone https://github.com/leaffoil/SLOP-MACHINE.git
cd SLOP-MACHINE
```

Start a local development server:

```bash
python -m http.server 8000
```

Open the application:

```text
http://localhost:8000
```

## Live Demo

**[https://slopmachine-wheat.vercel.app/](https://slopmachine-wheat.vercel.app/)**

## Project Status

**Experimental Prototype**

The project serves as a practical experiment in frontend development, particularly UI presentation, reel animations, and audio interaction.

Future development is optional. The current implementation already serves its main purpose as a UI and audio testing project.

---

*Built as a personal frontend experimentation project.*
