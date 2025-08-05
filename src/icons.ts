import { registerIconLibrary } from "@awesome.me/webawesome/dist/webawesome.js";
import arrowLeftIcon from "lucide-static/icons/arrow-left.svg";
import arrowLeftToLineIcon from "lucide-static/icons/arrow-left-to-line.svg";
import arrowRightIcon from "lucide-static/icons/arrow-right.svg";
import awardIcon from "lucide-static/icons/award.svg";
import badgeQuestionMarkIcon from "lucide-static/icons/badge-question-mark.svg";
import boxIcon from "lucide-static/icons/box.svg";
import circleQuestionMarkIcon from "lucide-static/icons/circle-question-mark.svg";
import crownIcon from "lucide-static/icons/crown.svg";
import deleteIcon from "lucide-static/icons/delete.svg";
import downloadIcon from "lucide-static/icons/download.svg";
import frownIcon from "lucide-static/icons/frown.svg";
import gemIcon from "lucide-static/icons/gem.svg";
import infoIcon from "lucide-static/icons/info.svg";
import iterationCWIcon from "lucide-static/icons/iteration-cw.svg";
import laughIcon from "lucide-static/icons/laugh.svg";
import octagonAlertIcon from "lucide-static/icons/octagon-alert.svg";
import partyPopperIcon from "lucide-static/icons/party-popper.svg";
import plusIcon from "lucide-static/icons/plus.svg";
import redo2Icon from "lucide-static/icons/redo-2.svg";
import rocketIcon from "lucide-static/icons/rocket.svg";
import settingsIcon from "lucide-static/icons/settings.svg";
import share2Icon from "lucide-static/icons/share-2.svg";
import shieldCheckIcon from "lucide-static/icons/shield-check.svg";
import sparklesIcon from "lucide-static/icons/sparkles.svg";
import squareArrowOutUpRightIcon from "lucide-static/icons/square-arrow-out-up-right.svg";
import squarePenIcon from "lucide-static/icons/square-pen.svg";
import swatchBookIcon from "lucide-static/icons/swatch-book.svg";
import thumbsUpIcon from "lucide-static/icons/thumbs-up.svg";
import triangleAlertIcon from "lucide-static/icons/triangle-alert.svg";
import undo2Icon from "lucide-static/icons/undo-2.svg";
import uploadIcon from "lucide-static/icons/upload.svg";
import wandIcon from "lucide-static/icons/wand.svg";
import mouseLeftButtonIcon from "./assets/mouse-left-button.svg";
import mouseRightButtonIcon from "./assets/mouse-right-button.svg";

/**
 * Re-export the Lucide icons we use with symbolic names, for easier modification
 * and to ensure all necessary icons are available offline.
 */
// biome-ignore format: leave all keys as strings
const icons: Record<string, string> = {
  // general
  "back-to-catalog": boxIcon,
  "checkpoint": shieldCheckIcon,
  "help": circleQuestionMarkIcon,
  "new-game": plusIcon,
  "puzzle-type": swatchBookIcon,
  "redo": redo2Icon,
  "restart-game": iterationCWIcon,
  "settings": settingsIcon,
  "save-game": downloadIcon,
  "load-game": uploadIcon,
  "share": share2Icon,
  "show-solution": sparklesIcon,
  "undo": undo2Icon,
  // generic notifications
  "info": infoIcon,
  "warning": triangleAlertIcon,
  "error": octagonAlertIcon,
  // help-viewer
  "history-back": arrowLeftIcon,
  "history-back-to-start": arrowLeftToLineIcon,
  "history-forward": arrowRightIcon,
  "offsite-link": squareArrowOutUpRightIcon,
  // puzzle-keys
  "key-clear": deleteIcon,
  "key-marks": squarePenIcon, // or maybe rectangle-ellipsis?
  "key-hints": wandIcon,
  "mouse-left-button": mouseLeftButtonIcon,
  "mouse-right-button": mouseRightButtonIcon,
  // puzzle-end-notifications
  "solved-a": awardIcon,
  "solved-b": crownIcon,
  "solved-c": gemIcon,
  "solved-d": laughIcon,
  "solved-e": partyPopperIcon,
  "solved-f": rocketIcon,
  "solved-g": thumbsUpIcon,
  "lost-a": frownIcon,
} as const;

const missingIcon = badgeQuestionMarkIcon;

registerIconLibrary("default", {
  resolver: (name) => {
    const icon = icons[name];
    if (!import.meta.env.PRODUCTION && !icon) {
      throw new Error(`Missing icon ${name}`);
    }
    return icon ?? missingIcon;
  },
  mutator: (svg) => {
    // wa-icon css has `svg { fill: currentColor; }` -- need to reset that
    svg.style.fill = "none";
  },
});
