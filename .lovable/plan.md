# PW-MARCO Telegram AI Bot

A Telegram group assistant bot that replies like a human, helps PW-MARCO users, and reports troublemakers to the owner (@officialmarco22).

## Bot behaviour

**Kab bolega**
- Jab koi bot ko tag kare (@botname), reply kare bot ke message pe, ya `/ask` use kare.
- Private chat me har message ka reply.
- Bina tag ke group ki normal baatcheet me chup rahega (spam na ho).

**Kaise bolega**
- User jis language me likhe (Hindi / Hinglish / English / koi bhi) usi me natural, short, human-jaisa reply — robotic nahi.
- Group knowledge built-in:
  - Website: PW-MARCO — https://pwmarco.info, sare courses free.
  - Error aaye to 5-10 min me fix ho jata hai.
  - Batch problem ho to developer screenshot dekh kar fix karta hai.
- Owner question ("who is your owner?") pe fixed line: "Mr. Marco is my Father and my God — he invented me to help you guys."
- @officialmarco22 ke against kabhi koi action ya rudeness nahi; unke liye respectful tone.

**Lecture / error complaint**
- Koi bole "lecture nahi chal raha" / error report kare to bot:
  1. User se: "Bhai tu apni problem aur error ka screenshot share kar de, boss fix kar denge."
  2. Group me owner ko tag: "@officialmarco22 boss dekho iska lecture nahi chal raha hai."

**Moderation (aapke faisle pe)**
- Bot khud kick/ban nahi karega. Jab lage koi user pareshan kar raha hai (galiyan, spam, harassment), turant group me tag karega:
  "@officialmarco22 boss kick him" / "boss ban him" — reason ke saath.
- Har aisi report dashboard ke moderation log me save hogi.

**Image generation**
- User bole "image banao / draw ..." to bot AI se image banakar group me bhejega (caption ke saath).

**Voice message**
- Sirf jab user maange ("voice me bolo", "audio bhejo") — tab bot AI voice generate karke voice message bhejega, usi language me.

## Dashboard (web)

Ek simple password-protected dashboard:
- **Messages** — recent group messages aur bot ke replies.
- **Moderation log** — kis user ki report hui, kab, kyun.
- **Settings** — bot ki personality/system prompt, knowledge text (website, rules, FAQ), owner username, on/off toggles for image & voice.
- Landing section me bot ka intro + "Add to group" link.

## Technical notes

- Lovable Cloud enable karke database: `telegram_messages`, `moderation_reports`, `bot_settings`, `chat_memory` (per-chat recent context taaki bot baat yaad rakhe).
- Public webhook route `src/routes/api/public/telegram/webhook.ts`; secret token header verify hoga. Webhook Telegram connector gateway ke `setWebhook` se register hoga.
- Telegram calls (sendMessage, sendPhoto, sendVoice, sendChatAction) Telegram connector gateway ke through — bot token kabhi code me nahi.
- AI: Lovable AI Gateway — reply ke liye `google/gemini-3.7-flash` (fast, multilingual), image ke liye gateway image model, voice ke liye gateway text-to-speech (OGG/MP3 as voice note).
- Ek structured decision step decide karega: normal reply / lecture-complaint / moderation-report / image / voice — aur uske hisaab se actions chalenge.
- Dashboard ek simple owner password (secret) se protect hoga; RLS enabled tables, writes sirf server side se.

## Aapko baad me kya karna hoga

- Bot ko group me **admin** banana (taaki messages padh sake aur mentions dekh sake; group privacy mode off).
- Dashboard password set karna.
