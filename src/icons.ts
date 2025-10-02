import {
  getIconLibrary,
  registerIconLibrary,
} from "@awesome.me/webawesome/dist/components/icon/library.js";
import arrowLeftIcon from "lucide-static/icons/arrow-left.svg";
import arrowLeftToLineIcon from "lucide-static/icons/arrow-left-to-line.svg";
import arrowRightIcon from "lucide-static/icons/arrow-right.svg";
import awardIcon from "lucide-static/icons/award.svg";
import badgeQuestionMarkIcon from "lucide-static/icons/badge-question-mark.svg";
import boxIcon from "lucide-static/icons/box.svg";
import boxesIcon from "lucide-static/icons/boxes.svg";
import checkIcon from "lucide-static/icons/check.svg";
import chevronDownIcon from "lucide-static/icons/chevron-down.svg";
import chevronLeftIcon from "lucide-static/icons/chevron-left.svg";
import chevronRightIcon from "lucide-static/icons/chevron-right.svg";
import circleCheckIcon from "lucide-static/icons/circle-check.svg";
import circleQuestionMarkIcon from "lucide-static/icons/circle-question-mark.svg";
import circleXIcon from "lucide-static/icons/circle-x.svg";
import crownIcon from "lucide-static/icons/crown.svg";
import deleteIcon from "lucide-static/icons/delete.svg";
import downloadIcon from "lucide-static/icons/download.svg";
import frownIcon from "lucide-static/icons/frown.svg";
import gemIcon from "lucide-static/icons/gem.svg";
import hashIcon from "lucide-static/icons/hash.svg";
import heartIcon from "lucide-static/icons/heart.svg";
import historyIcon from "lucide-static/icons/history.svg";
import infoIcon from "lucide-static/icons/info.svg";
import laughIcon from "lucide-static/icons/laugh.svg";
import octagonAlertIcon from "lucide-static/icons/octagon-alert.svg";
import partyPopperIcon from "lucide-static/icons/party-popper.svg";
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
import swatchBookIcon from "lucide-static/icons/swatch-book.svg";
import thumbsUpIcon from "lucide-static/icons/thumbs-up.svg";
import trafficConeIcon from "lucide-static/icons/traffic-cone.svg";
import trash2Icon from "lucide-static/icons/trash-2.svg";
import triangleAlertIcon from "lucide-static/icons/triangle-alert.svg";
import undo2Icon from "lucide-static/icons/undo-2.svg";
import uploadIcon from "lucide-static/icons/upload.svg";
import wandIcon from "lucide-static/icons/wand.svg";
import xIcon from "lucide-static/icons/x.svg";
import mouseLeftButtonIcon from "./assets/mouse-left-button.svg";
import mouseRightButtonIcon from "./assets/mouse-right-button.svg";
import restartIcon from "./assets/restart.svg";

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
  "favorite": heartIcon,
  "game": boxIcon,
  "game-in-progress": playIcon,
  "gameid": hashIcon,
  "generic-puzzle": boxIcon,
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
  "unfinished": trafficConeIcon,
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

const lucideMutator = (svg: SVGElement) => {
  // wa-icon css has `svg { fill: currentColor; }`. Lucide icons are stroke-only,
  // so remove fill and move color to stroke.
  svg.style.fill = "none";
  svg.style.stroke = "currentColor";
};

registerIconLibrary("default", {
  resolver: (name) => {
    const icon = defaultIcons[name];
    if (!import.meta.env.PROD && !icon) {
      throw new Error(`Missing icon ${name}`);
    }
    return icon ?? missingIcon;
  },
  mutator: lucideMutator,
});

// Web Awesome's built-in system icons (Font Awesome 7) are visually much
// heavier than Lucide. Replace a few key ones with Lucide versions, falling
// back to the built-in ones for all others.
// biome-ignore format: leave all keys as strings
const systemIcons: IconMap = {
  "check": checkIcon,
  "chevron-down": chevronDownIcon,
  "chevron-left": chevronLeftIcon,
  "chevron-right": chevronRightIcon,
  // "circle": circleIcon,
  // "eyedropper": pipetteIcon,
  // "grip-vertical": gripVerticalIcon,
  // "indeterminate": minusIcon,
  // "minus": minusIcon,
  // "pause": pauseIcon,
  // "play": playIcon,
  // "star": starIcon, // NOTE: star must support "regular" and "solid" variants
  // "user": userRoundIcon,
  "xmark": xIcon,
  "circle-question": circleQuestionMarkIcon,
  "circle-xmark": circleXIcon,
  // "copy": filesIcon,
  // "eye": eyeIcon,
  // "eye-slash": eyeOffIcon,
} as const;

const systemLibrary = getIconLibrary("system");

registerIconLibrary("system", {
  resolver: (name, ...options) =>
    systemIcons[name] ?? systemLibrary?.resolver(name, ...options) ?? missingIcon,
  mutator: (svg, hostElement) =>
    systemIcons[hostElement?.name ?? ""] !== undefined
      ? lucideMutator(svg)
      : systemLibrary?.mutator?.(svg, hostElement),
});
