import { registerIconLibrary } from "@awesome.me/webawesome/dist/webawesome.js";
import arrowLeftIcon from "lucide-static/icons/arrow-left.svg";
import arrowLeftToLineIcon from "lucide-static/icons/arrow-left-to-line.svg";
import arrowRightIcon from "lucide-static/icons/arrow-right.svg";
import awardIcon from "lucide-static/icons/award.svg";
import badgeQuestionMarkIcon from "lucide-static/icons/badge-question-mark.svg";
import boxesIcon from "lucide-static/icons/boxes.svg";
import checkIcon from "lucide-static/icons/check.svg";
import chevronDownIcon from "lucide-static/icons/chevron-down.svg";
import chevronLeftIcon from "lucide-static/icons/chevron-left.svg";
import chevronRightIcon from "lucide-static/icons/chevron-right.svg";
import circleIcon from "lucide-static/icons/circle.svg";
import circleCheckIcon from "lucide-static/icons/circle-check.svg";
import circleQuestionMarkIcon from "lucide-static/icons/circle-question-mark.svg";
import circleXIcon from "lucide-static/icons/circle-x.svg";
import crownIcon from "lucide-static/icons/crown.svg";
import deleteIcon from "lucide-static/icons/delete.svg";
import downloadIcon from "lucide-static/icons/download.svg";
import eyeIcon from "lucide-static/icons/eye.svg";
import eyeOffIcon from "lucide-static/icons/eye-off.svg";
import filesIcon from "lucide-static/icons/files.svg";
import frownIcon from "lucide-static/icons/frown.svg";
import gemIcon from "lucide-static/icons/gem.svg";
import gripVerticalIcon from "lucide-static/icons/grip-vertical.svg";
import hashIcon from "lucide-static/icons/hash.svg";
import historyIcon from "lucide-static/icons/history.svg";
import infoIcon from "lucide-static/icons/info.svg";
import laughIcon from "lucide-static/icons/laugh.svg";
import minusIcon from "lucide-static/icons/minus.svg";
import octagonAlertIcon from "lucide-static/icons/octagon-alert.svg";
import partyPopperIcon from "lucide-static/icons/party-popper.svg";
import pauseIcon from "lucide-static/icons/pause.svg";
import pipetteIcon from "lucide-static/icons/pipette.svg";
import playIcon from "lucide-static/icons/play.svg";
import plusIcon from "lucide-static/icons/plus.svg";
import redo2Icon from "lucide-static/icons/redo-2.svg";
import rocketIcon from "lucide-static/icons/rocket.svg";
import settingsIcon from "lucide-static/icons/settings.svg";
import share2Icon from "lucide-static/icons/share-2.svg";
import shieldCheckIcon from "lucide-static/icons/shield-check.svg";
import sparklesIcon from "lucide-static/icons/sparkles.svg";
import squareArrowOutUpRightIcon from "lucide-static/icons/square-arrow-out-up-right.svg";
import squarePenIcon from "lucide-static/icons/square-pen.svg";
import starIcon from "lucide-static/icons/star.svg";
import swatchBookIcon from "lucide-static/icons/swatch-book.svg";
import thumbsUpIcon from "lucide-static/icons/thumbs-up.svg";
import trash2Icon from "lucide-static/icons/trash-2.svg";
import triangleAlertIcon from "lucide-static/icons/triangle-alert.svg";
import undo2Icon from "lucide-static/icons/undo-2.svg";
import uploadIcon from "lucide-static/icons/upload.svg";
import userRoundIcon from "lucide-static/icons/user-round.svg";
import wandIcon from "lucide-static/icons/wand.svg";
import xIcon from "lucide-static/icons/x.svg";
import mouseLeftButtonIcon from "./assets/mouse-left-button.svg";
import mouseRightButtonIcon from "./assets/mouse-right-button.svg";
import restartIcon from "./assets/restart.svg";
import starFilledIcon from "./assets/star-filled.svg";

type IconMap = Readonly<Record<string, string>>;

/**
 * Re-export the Lucide icons we use with symbolic names, for easier modification
 * and to ensure all necessary icons are available offline.
 */
// biome-ignore format: leave all keys as strings
const defaultIcons: IconMap = {
  // general
  "back-to-catalog": boxesIcon,
  "checkpoint-add": shieldCheckIcon,
  "checkpoint-remove": trash2Icon,
  "gameid": hashIcon,
  "help": circleQuestionMarkIcon,
  "history": historyIcon,
  "history-checkpoint": circleCheckIcon,
  "history-current-move": playIcon,
  "new-game": plusIcon,
  "puzzle-type": swatchBookIcon,
  "redo": redo2Icon,
  "restart-game": restartIcon,
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

// Web Awesome's built-in system icons (Font Awesome 7) are visually much
// heavier than Lucide. Replace with Lucide versions. (Technically the system
// library has both "solid" and "regular" variants for a few icons; we just
// provide the regular ones for all purposes.
// biome-ignore format: leave all keys as strings
const systemIcons: IconMap = {
  "check": checkIcon,
  "chevron-down": chevronDownIcon,
  "chevron-left": chevronLeftIcon,
  "chevron-right": chevronRightIcon,
  "circle": circleIcon,
  "eyedropper": pipetteIcon,
  "grip-vertical": gripVerticalIcon,
  "indeterminate": minusIcon,
  "minus": minusIcon,
  "pause": pauseIcon,
  "play": playIcon,
  "star": starIcon,
  "user": userRoundIcon,
  "xmark": xIcon,
  "circle-question": circleQuestionMarkIcon,
  "circle-xmark": circleXIcon,
  "copy": filesIcon,
  "eye": eyeIcon,
  "eye-slash": eyeOffIcon,
} as const;

const missingIcon = badgeQuestionMarkIcon;

function registerLucideLibrary(libraryName: string, icons: IconMap) {
  registerIconLibrary(libraryName, {
    resolver: (name, _family = "classic", variant = "solid") => {
      const icon = icons[name];
      if (!import.meta.env.PROD && !icon) {
        throw new Error(`Missing icon ${name}`);
      }
      // Hack for system library, rating component:
      if (libraryName === "system" && name === "star" && variant === "solid") {
        return starFilledIcon;
      }
      return icon ?? missingIcon;
    },
    mutator: (svg) => {
      // wa-icon css has `svg { fill: currentColor; }` -- need to reset that
      svg.style.fill = "none";
      svg.style.stroke = "currentColor";
    },
  });
}

registerLucideLibrary("default", defaultIcons);
registerLucideLibrary("system", systemIcons);
