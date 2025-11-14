# Web common features

This web adaptation of the portable puzzle collection has several features 
to help it work better in a web browser and on a variety of different
screen sizes and input devices.

In addition to the features listed below, many (though not all) of the
[common features](manual/common#common) described in the original manual
are available in this version.

## On-screen keyboard {#virtual-keyboard}

For puzzles where you need to enter numbers or use other keys to solve the
puzzle (like Solo and Keen), this app will show an on-screen "virtual keyboard" 
allowing use on touch screens.

If you have a physical keyboard and want to save screen space, you can turn
off the virtual keyboard in the
<command-link command="settings:appearance">preferences</command-link>.

## Right mouse button on touch devices {#right-mouse}

Many puzzles need both the left and right mouse buttons. If you're using a touch
screen, you have a few options when the manual says to "right-click":

* **Tap multiple times.** In many puzzles, this will cycle through the left-click
  state on first tap, the right-click state on second tap, and back to the 
  "neutral" state (for puzzles that have that) on the third tap.

* **Long press** (hold) is treated as a right-click. To right-drag, continue 
  to hold your finger down and move it in the desired direction.

* **Two-finger tap** is also treated as a right-click. The two fingers don't 
  have to hit at exactly the same time. You might find it easier to put the 
  first finger down where you want to right-click, then very quickly tap and
  release another finger, anywhere convenient. (If you're a piano player, this 
  is a little like a grace note. Or really, a mordent but holding the main note 
  while striking the other key.)

  To right-drag, keep the first finger down and move it after lifting the other 
  finger. 

* **::mouse-left-button|left-click::/::mouse-right-button|right-click:: toggle.**
  You can show a button below the puzzle that lets you change whether tapping
  on the puzzle means left-click or right-click. The mouse button toggle starts 
  out hidden; turn it on in the 
  <command-link command="settings:mouse">preferences</command-link>.

  (This also works with a single-button mouse or touch pad, and to swap the left 
  and right buttons on any mouse when clicking on the puzzle.)

Tapping multiple times is always available (for puzzles that support it). 
The other options can be configured in the 
<command-link command="settings:mouse">preferences</command-link>,
where you can also adjust the detection time and audio feedback.

## Right drag with a mouse {#right-drag}

If you are using a mouse, you won't be able to click and drag on a puzzle
with the right mouse button. (This is a browser limitation. Right-click still 
works, just not right-drag.)

When the manual says to "right-drag" you can instead hold down <kbd>Ctrl</kbd> 
and then click and drag with the left mouse button.

## Checkpoints {#checkpoints}

This app allows you to save multiple "checkpoints" within a game and return 
to them later. Checkpoints can be helpful for puzzle difficulty levels that 
require backtracking (guessing). They're essentially a shortcut for repeatedly
pressing Undo.

To create a checkpoint at the current move, open the ::history:: history 
panel (near the undo/redo buttons) and choose *Save checkpoint.* You can then
continue trying to solve the puzzle. If you later find you've gone down the 
wrong path, rewind to your checkpoint by selecting it in the history panel.

After going back to a checkpoint, you can use ::undo:: undo and ::redo:: redo 
to explore the moves around it. Once you make a new move while rewound, though, 
all history past that point is erased—including any later checkpoints. If you 
change your mind (*before* making a new move), choose *Last move* in the 
history panel to redo all the way back to the end.

If you decide you no longer want a checkpoint, use the 
::checkpoint-remove:: delete button next to it.

::experimental:: Checkpoints are an experimental feature, currently unique to
this adaptation. They are likely to change somewhat in future updates.

## Autosave {#autosave}

This app automatically saves the current game in progress for each puzzle
and resumes it when you return to that puzzle later. This can be helpful if you
accidentally navigate your browser away from the puzzle page while playing.
(Or if the puzzle app crashes due to a bug.)

The autosave for a puzzle is reset whenever you start a new game or select 
a different variation or difficulty level in the ::puzzle-type:: type menu.

On the home screen, a puzzle's icon will show a ::game-in-progress:: triangle
when there is an autosaved game for that puzzle.

To clear all autosaved games for all puzzles, open the 
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete games in progress.*

## Saving, loading, exporting and importing games {#saved-games}

You can save the entire state of a game—including the undo history and any
saved [checkpoints](#checkpoints)—by choosing *::save-game:: Save…* in the game 
menu. Then choose *::load-game:: Load…* to restore it later.

Saved games are kept on your device, in your web browser's storage. To get a
separate file you can use with a different portable puzzle collection app
(or include in a bug report), click the *Export…* button in the save dialog. 
There’s a corresponding *Import…* button in the load dialog for bringing in
external files. (Exported files do not currently include checkpoints.)

To delete all saved games for all puzzles, open the
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete saved games.*
