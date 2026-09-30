# Differences in this version

This web adaptation of Simon Tatham’s Portable Puzzle Collection includes
some features and UI changes that are not included in the original.

## Changes affecting all puzzles

* ::experimental|Experimental:: This version allows you to save and return 
  to arbitrary [checkpoints](features#checkpoints) within the undo history.

* The command line options described in the manual are not available on the web. 
  However, you can provide game parameters or an ID or random seed in the
  URL to particular puzzle: add *?type=params* or *?id=id-or-seed*. (From within 
  a game, look in the <command-link command="share:link">share dialog</command-link>
  for copyable links.) 

## Changes to specific puzzles

* **Boats:** Left-clicking a number clue will grey it out (similar to Magnets,
  Towers and Undead). ::compatibility-warning|Compatibility warning::

* **Boats:** Includes a preliminary fix for a problem where easy games often couldn't
  be solved with the "Solve" command. A side effect of the fix is that Boats games at
  higher difficulty levels cannot be shared with other puzzle collection apps by random
  seed. (You'll see a different game until the fix is applied in the other apps).
  Share by game ID instead, which remains portable.

* **Rome:** The "M" and "H" keys fill in pencil marks (similar to Solo, Unequal, and
  other puzzles that support pencil marks). ::compatibility-warning|Compatibility warning::

-----

::experimental|Experimental:: Features marked with this symbol are considered
experimental. Although functional, they're likely to change significantly in future
updates. (There's also a slight possibility they might be removed entirely.)

::compatibility-warning|Compatibility warning:: This feature generates non-standard
saved game files. If you use it, an exported game will not be loadable by other portable
puzzle collection apps.
