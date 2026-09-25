# What’s new

## 2026-09-25 {.date}

[Mines](../mines) has a new preference that allows marking squares with a "?". When
turned on, right-clicking a covered square will cycle between a flag, a question mark,
and unmarking the square.


## 2026-09-17 {.date}

[Mines](../mines) has several new grid types: honeycomb, triangular, wrap-around grids,
and some more unusual tilings.

![Mines "spectres" tiling](images/mines-spectres-178.png){: width="178" height="178"}

When you're playing the new grids, remember that the surrounding mine counts include
every tile that touches even *just at a corner.* To help visualize this, the adjacent
unmarked tiles are highlighted while you press on a clue tile (with a number). To also
include tiles you've marked as having a mine, enable the new Mines preference "Highlight
adjacent flags when clicking on a clue."

On a touch screen with "Long press for right click" turned on, the highlights disappear
as soon a long press is detected. If you want to keep them visible longer, increase the
detection time in the <command-link command="settings:mouse">mouse button</command-link>
preferences.

(Anders Höglund contributed the additional Mines tilings in the original portable puzzle
collection.)


## 2026-09-16 {.date}

New *Add all marks* and *Hint* options in the game menu work like the `M` and `H` keys,
for puzzles that offer those features.

[Rome](../rome) now supports *Add all marks* (`M` key) and *Add hint marks* (`H` key).
Hints fills in all pencil marks except ones that couldn't be possible (like arrows that
point off the edge of the board or directly at the opposite arrow).
