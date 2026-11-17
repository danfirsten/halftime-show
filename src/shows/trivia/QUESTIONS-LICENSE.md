# Licence of the question bank

`questions.json` is a curated subset of the [Open Trivia Database](https://opentdb.com), which Open Trivia Database
publishes under the [Creative Commons Attribution-ShareAlike 4.0 International licence](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0).

- **Credit:** questions from Open Trivia Database, CC BY-SA 4.0. The show prints this line under every question.
- **What was taken:** the multiple choice questions of three categories (General Knowledge, Entertainment: Film,
  Entertainment: Television), fetched once while this show was written, never at run time.
- **What was changed:** HTML entities were decoded, duplicates and any question that names the streaming service were
  dropped, questions whose answers are "all of the above" or "none of these" were dropped, and each row was given a
  short id and stored as `[id, question, right answer, [three wrong answers]]`.
- **ShareAlike:** this file stays under CC BY-SA 4.0 whatever else is in the repository. The rest of Halftime Show is
  MIT (see the top-level `LICENSE`). Anyone who reuses or changes `questions.json` shares it under the same licence
  and keeps this credit.

There is no endorsement by Open Trivia Database.
