# S06E40 Missing Episode: Sources and Methodology

Research performed: 2026-07-13

## Purpose

This note records how the broadcast date, hot-seat contestants, known winnings,
and likely reason for the local S06E40 gap were reconstructed. It separates
facts established by primary evidence from high-confidence identification and
inference.

## Evidence Standard

Sources were weighted in this order:

1. Archived television schedules and dated Planet/Siol programme articles.
2. Surviving official programme video clips.
3. The beneficiary organisation's annual report for a charity prize.
4. Local adjacent-episode video, subtitles, catalogue rows, and the saved
   numbering crosswalk for continuity checks.
5. Fandom only as a search lead. Its incomplete S06E40 entry was not treated as
   proof of contestants or winnings.

HTTP/API and sitemap searches were used to locate pages and surviving video
assets. They were not used to infer what appeared on screen. Video facts were
obtained by inspecting the actual clip frames and audio. Subtitle text was used
only as a continuity helper and was checked against the adjacent local episode.

## Broadcast Date Method

1. Search for schedules and programme articles containing the date, season, and
   episode number.
2. Verify the result against an archived daily TV schedule, because current
   Planet pages can have migration dates rather than their original publication
   dates.
3. Cross-check with original, dated Siol/Planet articles published immediately
   before and on the broadcast date.

Evidence:

- [Archived Planet TV schedule for 26 May 2023](https://web.archive.org/web/20230610215402id_/https://spored.tv/planet-tv/26-05-2023)
  identifies `Milijonar`, season 6, episode 40, in the 21:08-22:36 slot.
- [Advance Planet/Siol article, 24 May 2023](https://siol.net/planet-tv/milijonar/v-milijonarja-prihaja-bostjan-narat-607372)
  promotes Boštjan Narat for the Friday episode on 26 May.
- [Day-of Planet/Siol article, 26 May 2023](https://siol.net/planet-tv/milijonar/godler-je-zelel-v-slovenijo-znasel-se-pa-v-nemciji-video-607547)
  gives the advertised start time as 21:00 and identifies the programme shown
  that evening.

Conclusion: canonical S06E40 aired on Friday, 26 May 2023. The small difference
between 21:00 in promotion and 21:08 in the EPG is normal scheduling drift; the
archived EPG is the more precise record of the actual slot.

## Contestant Reconstruction Method

The hot-seat roster was reconstructed by joining four independent continuity
signals. This does not recover the complete fast-fingers lineup.

### Matic Kremžar

- Local S06E39 ends with Matic still playing after question 7.
- The local catalogue records him as pending in
  [`contestants.csv`](contestants.csv) for S06E39.
- Therefore he necessarily continued in the immediately following broadcast,
  S06E40.

This is direct adjacent-episode continuity evidence, not a web-derived guess.

### Tine from Deskle

- The [26 May Planet/Siol article](https://siol.net/planet-tv/milijonar/godler-je-zelel-v-slovenijo-znasel-se-pa-v-nemciji-video-607547)
  explicitly says that a regular contestant named Tine from Deskle appears
  before Boštjan Narat.
- Its surviving [official anecdote clip](https://video.siol.net/embed/fn4u055CNP)
  shows Tine in the studio.
- A second [official episode-40 promo clip](https://video.siol.net/embed/pn1zEEoVGJ)
  shows the same contestant at question 10.
- Visual comparison with the later locally identified
  [Tine Lovišček frame](work/s10e21_frames/s10e21_lineup_06_tine_loviscek.jpg)
  strongly indicates that this was Tine Lovišček. Because no surviving S06E40
  name strap with his surname was found, the surname remains a high-confidence
  identification rather than direct S06E40 text evidence.

The official clips were located from the Siol embed pages and their public
Target Video metadata:

- [Anecdote clip metadata, asset 2701468](https://player.target-video.com/services/get/video/39872/2701468.json)
- [Question-10 promo metadata, asset 2701474](https://player.target-video.com/services/get/video/39872/2701474.json)

Inspecting nearby public identifiers found no additional S06E40 result clip.
Identifier enumeration was asset discovery only.

### Nika Kuplenk-Golović

- Local S06E41 opens by saying that the contestant from the previous episode
  reached question 5 and that Nika is returning to the hot seat.
- The statement is present near the beginning of the local S06E41 subtitle helper
  and is consistent with the S06E41 video and catalogue continuation row.

Therefore Nika played questions 1-4 in S06E40 and carried into S06E41. This is
direct continuation evidence from the next episode.

### Boštjan Narat

- The [24 May advance article](https://siol.net/planet-tv/milijonar/v-milijonarja-prihaja-bostjan-narat-607372)
  names Boštjan Narat and Srebrna nit as the charity beneficiary.
- The [26 May article](https://siol.net/planet-tv/milijonar/godler-je-zelel-v-slovenijo-znasel-se-pa-v-nemciji-video-607547)
  confirms his appearance in that evening's episode.

This is direct, dated broadcaster evidence.

## Winnings Method

Prize amounts were accepted only where a source states the amount or the
programme clip visibly/audibly establishes a secured value. No final amount was
inferred from ladder position alone.

### Boštjan Narat: EUR 5,000

- [Srebrna nit's 2023 annual report](https://www.srebrna-nit.si/images/Porocilo_o_delu_2023_Srebrna_nit.docx)
  records a EUR 5,000 donation contract arising from Boštjan Narat's successful
  appearance on the quiz.
- The report notes that the donation had not yet been paid when the report was
  prepared. That affects payment status, not the stated quiz-derived value.

This is the strongest surviving evidence for his exact result because it comes
from the named beneficiary and gives the value explicitly.

### Tine: at least EUR 1,000

- In the [official episode-40 promo clip](https://video.siol.net/embed/pn1zEEoVGJ),
  the ladder advances from question 9 at EUR 1,000 to question 10 at EUR 2,500.
- The host's audio states that an incorrect answer at question 10 would leave
  Tine with at least EUR 1,000.
- The clip ends before the result of question 10, so EUR 1,000 is a proven lower
  bound, not a proven final prize.

### Matic and Nika

- No surviving web source or clip establishes Matic's final S06E40 result.
- Nika did not finish in S06E40. She continued into S06E41 and ultimately
  received EUR 1,000 there, so that amount must not be recorded as a completed
  S06E40 payout.

Consequently the exact S06E40 episode total remains unknown. Direct evidence
establishes at least EUR 6,000 in earned or secured value: Boštjan's EUR 5,000
plus Tine's minimum EUR 1,000. Matic's final result and any amount Tine earned
above EUR 1,000 remain unresolved.

## How the Local Gap Was Diagnosed

1. Compare adjacent local media dates and content. Local S06E39 is the 19 May
   broadcast, while the next retained file contains the 2 June broadcast.
2. Check the pre-refactor numbering record. The former local S06E40 maps to
   canonical S06E41 in the saved episode crosswalk retained with the wider media archive.
3. Compare that gap with the platform's availability timeline.

Platform evidence:

- The surviving [Planeteka sitemap](https://api.videofield.net/sitemaps/planeteka/sitemap.xml)
  has no `lastmod` later than 21 May 2023.
- By 27 May, the [archived Planeteka homepage](https://web.archive.org/web/20230527153928id_/https://www.planeteka.si/)
  displayed a shutdown notice saying that the service would no longer be
  updated.
- S06E40 aired on 26 May, between those two points and after the last surviving
  sitemap update.

The proven fact is that the local archive skipped the 26 May broadcast and
stored the 2 June episode under the next locally available number. Planeteka's
shutdown at exactly this boundary is the strongest known explanation for why
the normal acquisition path failed. It remains an inference because no original
download or recording log survives to distinguish an absent VOD from a failed
download, failed recording, or later file deletion.

## Rejected Explanation

The studio power failure was checked because it occurred near this period. The
[Planet/Siol report dated 2 June 2023](https://siol.net/planet-tv/milijonar/neverjeten-zaplet-v-studiu-milijonarja-kar-naenkrat-nastala-popolna-tema-video-608024)
places it during the following episode's production and says recording was
completed that day. It therefore does not explain the missing 26 May episode.
