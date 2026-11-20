# Conversation log

Session date: 2026-11-20
Repository: S-tier (Pocket Stats)

---

## 1. User

> https://github.com/microsoft/BitNet
> https://bitnet-demo.azurewebsites.net
> https://docs.google.com/spreadsheets/d/1NgHDxbVWJFolq8bLvLkuPWKC7i_R6I6W/edit?gid=2011456595#gid=2011456595

## 2. Claude: what it did

1. **Checked the repository.** It ran `git log`, `ls` and read the README. The repo holds **Pocket Stats**, a private, offline phone app for tracking things like mood, sleep, gym sessions and food. It has a barcode food scanner, a bulking/recomp planner and an adaptive coach. Its optional photo recognition uses the Anthropic SDK. Latest commit: `2d4b0f7 Stop tracking the APK`.
2. **Tried to open the Google Sheet** through the Google Drive connector. It failed with `Incompatible auth server: does not support dynamic client registration`.

## 3. Claude: reply

I got your three links but no instructions, so I'm not sure what you want done with them yet.

What I could check:

- **BitNet (GitHub repo):** Microsoft's engine for running tiny "1-bit" AI language models on an ordinary phone or computer processor, with no internet connection.
- **The demo site:** Microsoft's hosted demo of the same thing. Nothing needs changing there.
- **The Google Sheet:** I couldn't open it. Your Google Drive connection in this session gave a login error ("incompatible auth server"). You can reconnect Google Drive, or download the sheet as a CSV or Excel file and send it here.

My guess is you want Pocket Stats to have an AI that runs on the phone itself, for the coach or the food photo recognition. Right now photo recognition sends pictures to Claude over the internet. BitNet would keep everything on the phone, which fits the app's no-data-leaves-the-phone design. If that's what you mean, here's what to expect:

- **It's possible, but it's a big job.** BitNet is written in C++, and there's no official version that runs inside a web page. It would have to be built into the Android app as native code. The single-file and GitHub Pages versions of the app couldn't use it.
- **It makes the app much bigger.** The main BitNet model is about 0.4 GB, and the app is about 550 KB today. Users could download the model separately instead of getting it inside the app.
- **It can't look at photos.** BitNet only reads and writes text, so it can't replace the food photo recognition. It could handle text features like coach tips, meal-plan explanations or summaries of your stats.

What do you want to do: add on-device AI to the app, do something with the spreadsheet, or something else? If the sheet matters, please reconnect Drive or send me the file.

---

## 4. User

> Give an md file of the whole convo

## 5. Claude

Wrote this file (`conversation.md`).

---

## Open items

- **The spreadsheet is still unread.** The Google Drive connector now says it needs authorization. Reconnect Google Drive in your claude.ai connector settings, or upload the sheet as CSV/XLSX.
- **The goal for BitNet is still unclear.** Options: on-device text AI in the Android app, something to do with the spreadsheet, or something else.
