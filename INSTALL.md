# 28K HQ Desktop App — Install Guide

## Download

Get the latest version: **https://github.com/assanendiaye08-hue/28k-hq/releases/latest**

Pick your file:
- **Mac (Apple Silicon — M1/M2/M3/M4):** `28K.HQ_x.x.x_aarch64.dmg`
- **Mac (Intel):** `28K.HQ_x.x.x_x64.dmg`
- **Windows:** `28K.HQ_x.x.x_x64_en-US.msi`

Not sure which Mac you have? Click  → About This Mac. If it says M1/M2/M3/M4 → Apple Silicon. If it says Intel → Intel.

---

## Mac Install

1. Open the `.dmg` file
2. Drag **28K HQ** to your **Applications** folder
3. Open **28K HQ** from Applications
4. You'll see a warning: *"28K HQ is damaged and can't be opened"* — this is because the app isn't signed with Apple (costs $99/yr, not worth it for us)

**To fix the warning:**
- Open **Terminal** (Spotlight → type "Terminal")
- Paste this and hit Enter:
```
xattr -cr /Applications/28K\ HQ.app
```
- Now open **28K HQ** normally — it works

**Alternative fix (no Terminal):**
- Right-click (or Control+click) the app in Applications
- Click **Open**
- Click **Open** again on the popup
- It will launch and never ask again

---

## Windows Install

1. Open the `.msi` file
2. Windows SmartScreen may show: *"Windows protected your PC"*
3. Click **More info** → **Run anyway**
4. Follow the installer
5. Launch **28K HQ** from the Start menu

---

## First Launch

1. Click **Login with Discord**
2. Authorize in your browser
3. You're in — set a timer and start grinding

---

## Menu Bar

The app lives in your menu bar (top of screen on Mac, system tray on Windows). When you start a timer, the countdown shows there. Click the icon to open/close the app.
