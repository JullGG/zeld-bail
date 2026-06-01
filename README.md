<div align="center">

# Renvy Bail

### Modified WhatsApp Socket Engine for Renvy Bot

<p>
  <img src="https://img.shields.io/badge/version-1.3-111827?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/runtime-CommonJS-111827?style=for-the-badge" alt="runtime" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-111827?style=for-the-badge" alt="node" />
  <img src="https://img.shields.io/badge/owner-panpan-111827?style=for-the-badge" alt="owner" />
</p>

`Renvy Bail` adalah package WhatsApp socket berbasis Baileys yang sudah dimodifikasi untuk kebutuhan bot modern, fast response, channel/newsletter, AIRich message builder, interactive message, database auth, dan RTC caller.

</div>

---

## Overview

```txt
Name     : baileys
Version  : 1.3
Owner    : panpan
Bot      : Renvy
Runtime  : CommonJS
Node.js  : >= 20
Package  : Renvy Bail
```

## Installation

Install dari file lokal:

```bash
npm install ./Renvy-bail.tgz
```

Install dari GitHub:

```bash
npm install github:Panzqq/Renvy-bail
```

Import CommonJS:

```js
const baileys = require('baileys')
const { default: makeWASocket, useMultiFileAuthState } = require('baileys')
```

## Highlight Features

| Feature | Description |
|---|---|
| Fast Send Engine | Optimized send/relay message untuk bot yang butuh response cepat |
| Group Metadata Cache | Cache metadata grup dengan fallback supaya bot lebih stabil |
| Newsletter / Channel | Create, metadata, follow, update, react, fetch, dan delete channel |
| AIRich Builder | Rich message builder langsung dari package `baileys` |
| Interactive Message | Native flow, button, list, product, payment, album, event, dan PTV |
| Database Auth | Support auth state berbasis Keyv/database adapter |
| RTC Caller | Support `VoipClient` untuk eksperimen voice call / RTC |
| Anti Crash Patch | Patch socket dan query agar lebih aman dari error umum |
| Sensitive Log Cleaner | Console lebih bersih dari data sensitif session/key |

## Core Patch

```txt
[+] Anti crash handler
[+] Sensitive log cleaner
[+] Session repair helper
[+] Query safe retry
[+] Fast mode socket
[+] CommonJS friendly
[+] Boot banner Renvy Bail
```

## Fast Send Engine

```txt
[+] Fast group send
[+] Group send tanpa metadata berat
[+] Optional send queue
[+] Optional send retry
[+] Fast no-session skip
[+] Sender key retry
[+] Optimized relay message
[+] Read receipt, delivery receipt, dan update media message
```

## Group System

```txt
[+] groupMetadata cache
[+] stale group metadata fallback
[+] minimal metadata fallback
[+] auto clear expired metadata cache
[+] anti rate-overlimit metadata query
[+] groupCreate
[+] groupLeave
[+] groupUpdateSubject
[+] groupUpdateDescription
[+] groupParticipantsUpdate
[+] groupRequestParticipantsList
[+] groupRequestParticipantsUpdate
[+] groupInviteCode
[+] groupRevokeInvite
[+] groupAcceptInvite
[+] groupAcceptInviteV4
[+] groupGetInviteInfo
[+] groupToggleEphemeral
[+] groupSettingUpdate
[+] groupMemberAddMode
[+] groupJoinApprovalMode
[+] groupFetchAllParticipating
```

## Newsletter / Channel

```txt
[+] newsletterCreate
[+] newsletterMetadata
[+] newsletterFollow
[+] newsletterUnfollow
[+] newsletterMute
[+] newsletterUnmute
[+] newsletterAction
[+] newsletterReactionMode
[+] newsletterUpdateName
[+] newsletterUpdateDescription
[+] newsletterUpdatePicture
[+] newsletterRemovePicture
[+] newsletterAdminCount
[+] newsletterChangeOwner
[+] newsletterDemote
[+] newsletterDelete
[+] newsletterReactMessage
[+] newsletterFetchMessages
[+] newsletterFetchUpdates
[+] subscribeNewsletterUpdates
```

Create channel:

```js
await conn.newsletterCreate('Renvy Official', 'Channel resmi Renvy Bail', 'ALL')
```

Get channel metadata:

```js
const meta = await conn.newsletterMetadata('jid', '120xxx@newsletter', 'OWNER')
```

## AIRich Message Builder

AIRich sudah ditanam langsung ke package `baileys`, jadi bisa dipakai tanpa package builder tambahan.

```js
const Baileys = require('baileys')

const msg = new Baileys.AIRich()
  .text('Visit [Google](https://google.com) for details')
  .build()
```

Kirim langsung lewat socket:

```js
const Baileys = require('baileys')

await new Baileys.AIRich(conn)
  .title('Renvy AIRich')
  .text('Visit [Google](https://google.com) for details')
  .footer('Renvy Bail')
  .send(m.chat, {
    quoted: m,
    botJid: conn.user?.id
  })
```

AIRich capabilities:

```txt
[+] Rich text builder
[+] Hyperlink parser: [text](url)
[+] Citation parser
[+] LaTeX/media style payload helper
[+] Native flow interactive payload
[+] Button builder
[+] Carousel builder
[+] Image/content helper
[+] Fluent chaining API
[+] CJS export dari require('baileys')
```

## Interactive Message

```txt
[+] Native flow button
[+] Interactive message
[+] Button message
[+] List message
[+] Template button
[+] Product message
[+] Payment message
[+] Album message
[+] Event message
[+] Scheduled call message
[+] Poll message
[+] Poll result snapshot
[+] PTV / video bulat
[+] Group story message
[+] AI message attribute
[+] Edit message
[+] Delete message
[+] Disappearing message setting
```

## Dugong Helper

```txt
[+] handlePayment
[+] handleProduct
[+] handleInteractive
[+] handleAlbum
[+] handleEvent
[+] handlePollResult
[+] handleGroupStory
```

## Database Auth / Keyv Session

```txt
[+] makeKeyvAuthState
[+] makeDatabaseAuthState
[+] Support adapter database berbasis Keyv
[+] Bisa dipakai untuk Redis/Mongo/SQLite/custom adapter
[+] Session fleksibel untuk bot panel dan multi environment
```

## RTC / Caller

RTC caller tersedia lewat `caller.mjs`.

```js
const { VoipClient } = await import('baileys/caller.mjs')
```

```txt
[+] VoipClient
[+] ActiveCall
[+] Audio feeder
[+] Relay transport
[+] Signaling engine
[+] WASM engine
[+] Worker bootstrap
[+] Call timeout handling
[+] Active call release fix
```

## Profile, Privacy, and Account

```txt
[+] profilePictureUrl
[+] updateProfilePicture
[+] removeProfilePicture
[+] updateProfileStatus
[+] updateProfileName
[+] updateBlockStatus
[+] fetchBlocklist
[+] fetchStatus
[+] fetchPrivacySettings
[+] updateLastSeenPrivacy
[+] updateOnlinePrivacy
[+] updateProfilePicturePrivacy
[+] updateStatusPrivacy
[+] updateReadReceiptsPrivacy
[+] updateGroupsAddPrivacy
[+] updateDefaultDisappearingMode
```

## Chat Utility

```txt
[+] chatModify
[+] resyncAppState
[+] cleanDirtyBits
[+] addChatLabel
[+] removeChatLabel
[+] addMessageLabel
[+] removeMessageLabel
[+] star
[+] upsertMessage
```

## Socket Utility

```txt
[+] makeWASocket
[+] requestPairingCode
[+] waitForConnectionUpdate
[+] waitForSocketOpen
[+] sendRawMessage
[+] sendNode
[+] query
[+] logout
[+] end
[+] uploadPreKeys
[+] uploadPreKeysToServerIfRequired
[+] sendWAMBuffer
```

## Presence

```txt
[+] sendPresenceUpdate
[+] presenceSubscribe
[+] online/offline presence
[+] composing/recording state
```

## CommonJS Plugin Example

```js
let handler = async (m, { conn }) => {
    const Baileys = require('baileys')

    await new Baileys.AIRich(conn)
        .title('Renvy Bail')
        .text('Visit [Google](https://google.com) for details')
        .footer('Owner: panpan')
        .send(m.chat, {
            quoted: m,
            botJid: conn.user?.id
        })
}

handler.help = handler.command = ['tesrich']
handler.tags = ['main']
module.exports = handler
```

## Package Exports

```txt
[+] WAProto
[+] Utils
[+] Types
[+] Store
[+] Defaults
[+] WABinary
[+] WAM
[+] WAUSync
[+] makeWASocket
[+] AIRich
[+] installAIRich
```

## Owner

```txt
Renvy Bail v1.3 by panpan
```
