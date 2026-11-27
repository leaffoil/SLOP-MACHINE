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

<kbd>Experimental Prototype</kbd>

The project serves as a practical experiment in frontend development, particularly UI presentation and audio interaction.

Future development is optional. The current implementation already serves its main purpose as a UI and audio testing project.

---

*Built as a personal frontend experimentation project.*
