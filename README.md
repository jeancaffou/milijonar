# Milijonar — bilingual television quiz catalogue

## Public catalogue

**[Open the Milijonar catalogue](https://jeancaffou.github.io/milijonar)**

This project is a searchable research catalogue of the Slovenian television quiz *Milijonar*, based on the *Who Wants to Be a Millionaire?* format. It documents ten seasons broadcast from March 2019 to May 2026 and connects episodes, contestants, questions, answers, winnings and archive images in one place.

## What the catalogue contains

The catalogue currently covers:

- 10 seasons
- 474 places in the original episode sequence
- 473 catalogued episodes and one clearly marked unavailable episode
- 1,049 complete hot-seat runs
- 9,536 question boards
- 1,643 contestant and fastest-finger profiles
- 28,365 unique JPG archive images

Question records include the question and four options, the correct answer, the contestant’s answer, its position and value, recorded lifelines, the broadcast date and the associated contestant. The archive also records Fastest Finger First contestants and winners, final winnings and runs that continue into later episodes.

## Complete contestant runs

A contestant’s complete hot-seat run is the most detailed page in the catalogue. All questions from that run appear together in order, including continuations spread across more than one episode.

Individual questions remain directly findable through search and episode pages. Opening a result takes the reader to the relevant question inside the complete run rather than separating every question onto its own page.

Questions can also be browsed by their position in the game, from Q1 through Q14. Each position page gathers the matching questions in broadcast order and links back to the question within the contestant's complete run.

The question index also groups repeated questions. It includes both identical repeats and carefully matched questions that ask essentially the same thing with slightly different wording. Every occurrence links back to its place in the original contestant run.

## Question-topic preparation guide

The catalogue includes a dedicated preparation guide that assigns every question to one specific topic and ranks those topics from most frequent to least frequent. It is intended to answer a practical question: which knowledge recurs most often in the programme?

Each topic shows its share of the full archive, where it tends to appear on the question ladder, representative examples and the complete list of matching questions. GPT reviews the complete Slovenian question and all four answer options before choosing the knowledge needed to solve it. Broad fields are used only to help readers filter the guide; there is no miscellaneous or general-knowledge category in the ranking.

## Slovenian and English

The catalogue interface is available in Slovenian and English. Question wording and all four answer options remain in original Slovenian in both versions. This preserves wordplay, idiom, names and context that would be distorted or lost in translation.

## Archive images

The records include JPG frames showing question screens, correct-answer reveals, Fastest Finger First contestants and winners, contestant details, lifelines and results.

Images are included to make names, wording, answers and outcomes independently checkable. A blank field is not filled by guesswork: it means that the detail could not be confirmed from the available material or does not apply to that record.

## Exploring the archive

The catalogue can be explored by:

- season and broadcast chronology
- episode and airing date
- complete contestant run
- contestant or fastest-finger participant
- question position, from Q1 through Q14
- question wording or answer options
- winnings and lifeline use

Episodes, people, runs and questions link to one another, making it possible to begin with a single search result and follow its wider context.

The contestant index also includes two record tables: accumulated personal winnings across multiple runs and the furthest question reached. Episode and season indexes show how much money was awarded, while the main overview separates contestant winnings from charity awards.

## Statistics and answer-pattern analysis

The statistics section summarizes the size of the archive, question totals by season, correct-answer positions, progress along the prize ladder, lifeline use, final winnings and the highest recorded results.

An in-depth interactive analysis within the statistics section examines whether sequences of correct-answer letters contain a reusable predictive pattern. It compares short and long sequences, cycles, lags and other models, while distinguishing repeatable findings from patterns that only fit past data.

## How the catalogue is organised

Everything needed to build and publish the web catalogue is contained in this folder:

- `questions.csv` and `contestants.csv` are the two catalogue tables.
- `work/` contains the JPG archive images referenced by those tables.
- `src/` contains the bilingual pages, visual design and generated statistical data.
- `tools/` contains optional maintenance scripts for regenerating the two statistical analyses.
- The committed analysis results are `src/assets/data/answer-patterns.json` and `src/_data/generated/question-topics.json`; temporary review and feature files under `work/analysis-output/` are not part of the published catalogue.
- `MISSING_EPISODE_S06E40.md` and `MISSING_EPISODE_S07E21.md` document the two exceptional episode-numbering investigations.

The web build does not depend on files outside this folder.

### Optional analysis tools

The current statistical results are already included with the catalogue, so these tools are not needed for normal building or browsing.

- `tools/answer-sequence-analysis/` regenerates the interactive analysis of correct-answer-letter sequences. It is run only when catalogue rows or question/answer content changes, not after image or timestamp corrections.
- `tools/question-topic-review/` maintains the ranked question-topic preparation guide. GPT reviews the complete Slovenian question and all four options, one catalogue row at a time, and assigns a specific learning topic. The JavaScript utilities only prepare review batches, verify that every row has exactly one valid assignment, and calculate the published totals; they do not classify questions.

Each tool folder contains its own short explanation and regeneration command. Temporary feature tables are written under `work/analysis-output/` and are excluded from the publishable source; the published catalogue does not depend on those temporary files.

## Downloadable data

The two main catalogue tables are available for independent checking, research and reuse:

- `questions.csv` contains the question, answer and image references.
- `contestants.csv` contains Fastest Finger First groups, hot-seat contestants, results and image references.

## Scope and limitations

The catalogue focuses on the main *Milijonar* game. Viewer-prize, SMS, promotional, recap-only and performance segments are outside its scope unless they form part of the main game record.

Displayed no-stakes and switched-out questions are retained when the full question and correct answer are known. Continuations are joined into one logical run so final outcomes are not counted twice.

Names and identities are matched only where the available programme material supports that connection. People with the same name remain separate when their identity cannot be established safely.
