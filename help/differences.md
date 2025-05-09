# Differences in this version

This web adaptation of Simon Tatham’s Portable Puzzle Collection includes
some features and UI changes that are not included in the original.

::experimental:: Items with this symbol are considered experimental. Although
functional, they're likely to change significantly in future updates.
(There's also a slight possibility they might be removed entirely.)

## Changes affecting all puzzles

* ::experimental:: This version allows you to save and return to arbitrary
  [checkpoints](features#checkpoints) within the undo history.

* This version is built with "stylus mode" enabled. In many puzzles where
  left-clicking does one thing and right-clicking does another, you can instead
  repeatedly tap (or left-click) to cycle through all available states.

* The command line options described in the manual are not available on the web. 
  However, you can provide game parameters or an ID or random seed in the
  URL to particular puzzle: add *?type=params* or *?id=id-or-seed*. (From within 
  a game, look in the <command-link command="share:link">share dialog</command-link>
  for copyable links.) 

## Changes to specific puzzles

* **Dominosa:** you can right-click (long press) *on* a number to toggle 
  highlighting all occurrences of that number in red or green.
  (In the original, this requires pressing a number key.)
  Right-clicking the space *between* numbers continues to place a barrier line.
  See [*Dominosa controls*](manual/dominosa#dominosa-controls) in the manual.

* **Filling:** this version's on-screen keyboard omits the <kbd>0</kbd> button.
  Use <kbd>⌫</kbd> instead. (The two keys have had the same function since 
  late 2025. This is only visible in apps that display an onscreen keyboard,
  not the official puzzle collection website.)

* ::experimental:: **Undead:** you can tap (left-click) a monster at the top 
  to place that monster in the highlighted square, and tap it again to clear it. 
  You can also long press (right-click) at the top to cycle the displayed counts 
  between total, remaining, and placed/remaining. 
  See [*Undead controls*](manual/undead#undead-controls) in the manual.

Many of these modifications have been offered as patches to the original collection.
The details may change in future updates, based on feedback from upstream maintainers.
(If and when they're accepted, they'll be removed from this list.)
