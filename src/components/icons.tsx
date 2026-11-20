import { useSyncExternalStore, type ComponentType, type ImgHTMLAttributes } from "react";
import { DEFAULT_THEME, parseTheme, type ThemeId } from "@/lib/theme";
import { kubaiImages, type KubaiImages } from "../../vendor/core/core/web/kubai/paint.js";
import archiveIcon from "../../vendor/core/core/web/kubai/archive.svg?raw";
import arrowLeftIcon from "../../vendor/core/core/web/kubai/arrow-left.svg?raw";
import atSignIcon from "../../vendor/core/core/web/kubai/at-sign.svg?raw";
import atomIcon from "../../vendor/core/core/web/kubai/atom.svg?raw";
import bookIcon from "../../vendor/core/core/web/kubai/book.svg?raw";
import bookmarkIcon from "../../vendor/core/core/web/kubai/bookmark.svg?raw";
import bulbIcon from "../../vendor/core/core/web/kubai/bulb.svg?raw";
import calendarIcon from "../../vendor/core/core/web/kubai/calendar.svg?raw";
import chatIcon from "../../vendor/core/core/web/kubai/chat.svg?raw";
import chatPlusIcon from "../../vendor/core/core/web/kubai/chat-plus.svg?raw";
import checkIcon from "../../vendor/core/core/web/kubai/check.svg?raw";
import chevronDownIcon from "../../vendor/core/core/web/kubai/chevron-down.svg?raw";
import chevronRightIcon from "../../vendor/core/core/web/kubai/chevron-right.svg?raw";
import chevronUpIcon from "../../vendor/core/core/web/kubai/chevron-up.svg?raw";
import chevronsDownIcon from "../../vendor/core/core/web/kubai/chevrons-down.svg?raw";
import chipIcon from "../../vendor/core/core/web/kubai/chip.svg?raw";
import clipboardIcon from "../../vendor/core/core/web/kubai/clipboard.svg?raw";
import clockIcon from "../../vendor/core/core/web/kubai/clock.svg?raw";
import closeIcon from "../../vendor/core/core/web/kubai/close.svg?raw";
import cloudIcon from "../../vendor/core/core/web/kubai/cloud.svg?raw";
import compassIcon from "../../vendor/core/core/web/kubai/compass.svg?raw";
import copyIcon from "../../vendor/core/core/web/kubai/copy.svg?raw";
import databaseIcon from "../../vendor/core/core/web/kubai/database.svg?raw";
import documentIcon from "../../vendor/core/core/web/kubai/document.svg?raw";
import downloadIcon from "../../vendor/core/core/web/kubai/download.svg?raw";
import driveIcon from "../../vendor/core/core/web/kubai/drive.svg?raw";
import editIcon from "../../vendor/core/core/web/kubai/edit.svg?raw";
import errorIcon from "../../vendor/core/core/web/kubai/error.svg?raw";
import externalLinkIcon from "../../vendor/core/core/web/kubai/external-link.svg?raw";
import eyeIcon from "../../vendor/core/core/web/kubai/eye.svg?raw";
import eyeOffIcon from "../../vendor/core/core/web/kubai/eye-off.svg?raw";
import flaskIcon from "../../vendor/core/core/web/kubai/flask.svg?raw";
import folderIcon from "../../vendor/core/core/web/kubai/folder.svg?raw";
import folderPlusIcon from "../../vendor/core/core/web/kubai/folder-plus.svg?raw";
import globeIcon from "../../vendor/core/core/web/kubai/globe.svg?raw";
import graphIcon from "../../vendor/core/core/web/kubai/graph.svg?raw";
import gripIcon from "../../vendor/core/core/web/kubai/grip.svg?raw";
import highlighterIcon from "../../vendor/core/core/web/kubai/highlighter.svg?raw";
import inboxIcon from "../../vendor/core/core/web/kubai/inbox.svg?raw";
import infoIcon from "../../vendor/core/core/web/kubai/info.svg?raw";
import keyIcon from "../../vendor/core/core/web/kubai/key.svg?raw";
import keyboardIcon from "../../vendor/core/core/web/kubai/keyboard.svg?raw";
import languageIcon from "../../vendor/core/core/web/kubai/language.svg?raw";
import libraryIcon from "../../vendor/core/core/web/kubai/library.svg?raw";
import linkIcon from "../../vendor/core/core/web/kubai/link.svg?raw";
import listPlusIcon from "../../vendor/core/core/web/kubai/list-plus.svg?raw";
import mapIcon from "../../vendor/core/core/web/kubai/map.svg?raw";
import mergeIcon from "../../vendor/core/core/web/kubai/merge.svg?raw";
import minusIcon from "../../vendor/core/core/web/kubai/minus.svg?raw";
import moonIcon from "../../vendor/core/core/web/kubai/moon.svg?raw";
import noteIcon from "../../vendor/core/core/web/kubai/note.svg?raw";
import notebookIcon from "../../vendor/core/core/web/kubai/notebook.svg?raw";
import notificationIcon from "../../vendor/core/core/web/kubai/notification.svg?raw";
import panelLeftCloseIcon from "../../vendor/core/core/web/kubai/panel-left-close.svg?raw";
import panelLeftOpenIcon from "../../vendor/core/core/web/kubai/panel-left-open.svg?raw";
import paperclipIcon from "../../vendor/core/core/web/kubai/paperclip.svg?raw";
import pinIcon from "../../vendor/core/core/web/kubai/pin.svg?raw";
import playIcon from "../../vendor/core/core/web/kubai/play.svg?raw";
import plusIcon from "../../vendor/core/core/web/kubai/plus.svg?raw";
import puzzleIcon from "../../vendor/core/core/web/kubai/puzzle.svg?raw";
import quoteIcon from "../../vendor/core/core/web/kubai/quote.svg?raw";
import robotIcon from "../../vendor/core/core/web/kubai/robot.svg?raw";
import rocketIcon from "../../vendor/core/core/web/kubai/rocket.svg?raw";
import routeIcon from "../../vendor/core/core/web/kubai/route.svg?raw";
import rssIcon from "../../vendor/core/core/web/kubai/rss.svg?raw";
import saveIcon from "../../vendor/core/core/web/kubai/save.svg?raw";
import searchIcon from "../../vendor/core/core/web/kubai/search.svg?raw";
import sendIcon from "../../vendor/core/core/web/kubai/send.svg?raw";
import settingsIcon from "../../vendor/core/core/web/kubai/settings.svg?raw";
import shieldIcon from "../../vendor/core/core/web/kubai/shield.svg?raw";
import sortIcon from "../../vendor/core/core/web/kubai/sort.svg?raw";
import sparkleIcon from "../../vendor/core/core/web/kubai/sparkle.svg?raw";
import starIcon from "../../vendor/core/core/web/kubai/star.svg?raw";
import starOffIcon from "../../vendor/core/core/web/kubai/star-off.svg?raw";
import successIcon from "../../vendor/core/core/web/kubai/success.svg?raw";
import sunIcon from "../../vendor/core/core/web/kubai/sun.svg?raw";
import syncIcon from "../../vendor/core/core/web/kubai/sync.svg?raw";
import tabsIcon from "../../vendor/core/core/web/kubai/tabs.svg?raw";
import tagIcon from "../../vendor/core/core/web/kubai/tag.svg?raw";
import textIcon from "../../vendor/core/core/web/kubai/text.svg?raw";
import trashIcon from "../../vendor/core/core/web/kubai/trash.svg?raw";
import undoIcon from "../../vendor/core/core/web/kubai/undo.svg?raw";
import uploadIcon from "../../vendor/core/core/web/kubai/upload.svg?raw";
import userIcon from "../../vendor/core/core/web/kubai/user.svg?raw";
import usersIcon from "../../vendor/core/core/web/kubai/users.svg?raw";
import warningIcon from "../../vendor/core/core/web/kubai/warning.svg?raw";
import wrenchIcon from "../../vendor/core/core/web/kubai/wrench.svg?raw";

type IconProps = Pick<ImgHTMLAttributes<HTMLImageElement>, "className" | "style" | "aria-hidden" | "aria-label">;
export type AppIcon = ComponentType<IconProps>;

const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | undefined;

function subscribeIconTheme(listener: () => void) {
  themeListeners.add(listener);
  if (themeObserver === undefined) {
    themeObserver = new MutationObserver(() => {
      for (const notify of themeListeners) notify();
    });
    themeObserver.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  }
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
  };
}

function readIconTheme() {
  return parseTheme(document.documentElement.dataset.theme);
}

function icon(svg: string): AppIcon {
  const sources: Partial<Record<ThemeId, KubaiImages>> = {};
  return function Icon({ className, style, "aria-label": label, "aria-hidden": hidden }: IconProps) {
    const theme = useSyncExternalStore(subscribeIconTheme, readIconTheme, () => DEFAULT_THEME);
    const image = sources[theme] ??= kubaiImages(svg, theme);
    const imageStyle = { ...style, "--kubai-dark-image": `url("${image.dark}")` };
    return (
      <img
        src={image.light}
        alt={label ?? ""}
        aria-hidden={hidden}
        width={24}
        height={24}
        draggable={false}
        className={className ? `kubai-icon ${className}` : "kubai-icon"}
        style={imageStyle}
      />
    );
  };
}

export const AlertCircle = icon(errorIcon);
export const AlertTriangle = icon(warningIcon);
export const Archive = icon(archiveIcon);
export const ArrowDownWideNarrow = icon(sortIcon);
export const ArrowLeft = icon(arrowLeftIcon);
export const Atom = icon(atomIcon);
export const AtSign = icon(atSignIcon);
export const Bell = icon(notificationIcon);
export const BookMarked = icon(bookmarkIcon);
export const BookOpen = icon(bookIcon);
export const BookOpenText = icon(bookIcon);
export const Bot = icon(robotIcon);
export const Brain = icon(sparkleIcon);
export const BrainCircuit = icon(sparkleIcon);
export const Calendar = icon(calendarIcon);
export const Check = icon(checkIcon);
export const CheckCheck = icon(checkIcon);
export const CheckCircle2 = icon(successIcon);
export const ChevronDown = icon(chevronDownIcon);
export const ChevronRight = icon(chevronRightIcon);
export const ChevronsDown = icon(chevronsDownIcon);
export const ChevronUp = icon(chevronUpIcon);
export const ClipboardCopy = icon(clipboardIcon);
export const Clock = icon(clockIcon);
export const Clock3 = icon(clockIcon);
export const Cloud = icon(cloudIcon);
export const Compass = icon(compassIcon);
export const Copy = icon(copyIcon);
export const Cpu = icon(chipIcon);
export const Database = icon(databaseIcon);
export const Download = icon(downloadIcon);
export const DownloadCloud = icon(downloadIcon);
export const ExternalLink = icon(externalLinkIcon);
export const Eye = icon(eyeIcon);
export const EyeOff = icon(eyeOffIcon);
export const FileArchive = icon(archiveIcon);
export const FileText = icon(documentIcon);
export const FileUp = icon(uploadIcon);
export const FlaskConical = icon(flaskIcon);
export const Folder = icon(folderIcon);
export const FolderOpen = icon(folderIcon);
export const FolderPlus = icon(folderPlusIcon);
export const FolderSync = icon(syncIcon);
export const Globe = icon(globeIcon);
export const Globe2 = icon(globeIcon);
export const GripVertical = icon(gripIcon);
export const HardDrive = icon(driveIcon);
export const Highlighter = icon(highlighterIcon);
export const Inbox = icon(inboxIcon);
export const Info = icon(infoIcon);
export const Keyboard = icon(keyboardIcon);
export const KeyRound = icon(keyIcon);
export const Languages = icon(languageIcon);
export const Layers = icon(tabsIcon);
export const Layers3 = icon(tabsIcon);
export const LibraryBig = icon(libraryIcon);
export const Lightbulb = icon(bulbIcon);
export const Link2 = icon(linkIcon);
export const ListPlus = icon(listPlusIcon);
export const Map = icon(mapIcon);
export const MapPin = icon(pinIcon);
export const Merge = icon(mergeIcon);
export const MessageSquare = icon(chatIcon);
export const MessageSquarePlus = icon(chatPlusIcon);
export const MessagesSquare = icon(chatIcon);
export const Minus = icon(minusIcon);
export const Moon = icon(moonIcon);
export const Network = icon(graphIcon);
export const NotebookPen = icon(notebookIcon);
export const Orbit = icon(atomIcon);
export const PanelLeft = icon(panelLeftOpenIcon);
export const PanelLeftClose = icon(panelLeftCloseIcon);
export const PanelLeftOpen = icon(panelLeftOpenIcon);
export const Paperclip = icon(paperclipIcon);
export const PenLine = icon(editIcon);
export const Play = icon(playIcon);
export const Plus = icon(plusIcon);
export const Puzzle = icon(puzzleIcon);
export const Quote = icon(quoteIcon);
export const RefreshCw = icon(syncIcon);
export const Rocket = icon(rocketIcon);
export const RotateCcw = icon(undoIcon);
export const Route = icon(routeIcon);
export const Rss = icon(rssIcon);
export const Save = icon(saveIcon);
export const Search = icon(searchIcon);
export const Send = icon(sendIcon);
export const Settings = icon(settingsIcon);
export const ShieldCheck = icon(shieldIcon);
export const Sparkles = icon(sparkleIcon);
export const Star = icon(starIcon);
export const StarOff = icon(starOffIcon);
export const StickyNote = icon(noteIcon);
export const Sun = icon(sunIcon);
export const Tag = icon(tagIcon);
export const Trash2 = icon(trashIcon);
export const Type = icon(textIcon);
export const Upload = icon(uploadIcon);
export const User = icon(userIcon);
export const Users = icon(usersIcon);
export const Wand2 = icon(sparkleIcon);
export const Wrench = icon(wrenchIcon);
export const X = icon(closeIcon);
export const XCircle = icon(errorIcon);

export function Spinner({ className, style }: IconProps) {
  return <span aria-hidden="true" className={className ? `litera-spinner ${className}` : "litera-spinner"} style={style} />;
}
