# Project: Grand Strategy & God-Sim Hybrid
- Tech Stack: Godot 4.x (GDScript)
- Game Modes: 
  1. Ruler Mode (Interact with menus, make laws, declare wars, manage the Endless Sky style supply/demand economy).
  2. God Mode (Hands-off simulation where nations run autonomously, player can directly edit tile data/agent traits).
- Architecture: Data-driven design. Nations, Cities, and Tiles are data objects updated via a global "Simulation Tick" manager.
