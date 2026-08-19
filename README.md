# TikTokToTranscript

Build contract: [SPEC.md](./SPEC.md).
How we work: [CONTRIBUTING.md](./CONTRIBUTING.md). `main` stays buildable and testable.
How we build: [BUILD.md](./BUILD.md) — stack, modules, tests, PR sequence.

Free TikTok → text. Paste a link, get the caption, on-screen text, and spoken transcript when available. Copy, translate, jump by timestamp.

This is the YoutubeToTranscript slot for short video: not the profit center, the traffic layer and the load that forges ClipAPI.

## Why this, and why overseas

English Google already has the query: `tiktok transcript`, `tiktok to text`, `download tiktok captions`, `tiktok video to text`. Creators, students, and people dumping clips into ChatGPT do this every day. TikTok’s app shows some text; it does not give a clean, login-free, indexable page.

Ship the free surface that can rank. Send anyone who needs bulk or a pipeline to ClipAPI.

## Exact demand

- Who: students, newsletter writers, clip-farm researchers, anyone pasting TikToks into Claude / ChatGPT
- Queries that already exist: the phrases above, plus `tiktok captions downloader`
- Who pays: advertisers (AdSense). Users want free and fast, no account
- Acceptance: search → full text on screen in under 10 seconds, no signup

## Exact connector

Public TikTok caption / ASR track + video metadata. Callers never see the scraper. Input is a URL or video id; output is timed text plus author and music metadata.

Dirty work stays inside: region locks, missing captions, slideshow posts, deleted videos. No caption → hard fail. Do not run expensive ASR on the free site or the unit economics die.

## Exact combination

```
Google → this site (free + AdSense) → bulk users → ClipAPI
                                 → DailyBrief (own consumer app)
```

Footer, one link only: Need a TikTok Transcript API?

## Cost control

- One cheap VPS, budget $20–40 / mo
- Cache key = `(video_id, lang)`; hits never go back to TikTok
- No ASR on this property, no auth, no app
- No SaaS besides ads

Target: 100k monthly visits with host cost still under $50.

## Business model

- Primary: display ads
- Secondary: handoff to ClipAPI
- No user subscriptions. Charge here and you lose the SEO free-tool slot

Success: 90 days after launch, organic sessions > 3,000 / day, ads cover the box, ClipAPI has its first signups from this page.

## Will not do

- No TikTok studio, no editor, no scheduler
- No watermark-free video download (copyright + bandwidth)
- No login, no following graph, no For You clone
- No fight with TikTok as a platform

## First two weeks

1. One input, timed transcript, one-click copy
2. Handle: captioned video / slideshow / deleted / no speech
3. Basic SEO: title, description, indexable text on success pages
4. API teaser pointing at clipapi

## Dogfood

DailyBrief and every ClipAPI doc example use real links from this site. The day this thing is busy is the day ClipAPI’s cache and rate limits become production-grade.

## Risk

TikTok anti-bot and takedowns. Serve only the public video the user asked for. Do not mirror the app. Do not store media files.
