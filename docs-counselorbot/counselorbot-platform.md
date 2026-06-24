# CounselorBot — the platform

CounselorBot is an AI-powered web application that helps students analyze their
learning and career profiles through a **guided chat** based on the questionnaires it
hosts. Questionnaires on CounselorBot are currently in **test mode** and available only
in **Swedish, English, and Spanish**. For Italian-speaking students, the official,
validated questionnaires are administered through
[competenzestrategiche.it](https://competenzestrategiche.it).

## What it is (and what it is not)

- CounselorBot is the **software platform**: it administers questionnaires, runs the
  chat with AI counselors, builds the student profile, and provides an administration
  and research console.
- It is **separate from the competenzestrategiche.it project**: the latter is the
  research and content project on strategic competences (theory, QSA/QSAr and related
  constructs). CounselorBot is the tool that delivers the questionnaires and the
  assisted counseling experience.
- The **Savickas** narrative career interview is a resource of this platform, not of
  the competenzestrategiche.it project.

## Hosted questionnaires

CounselorBot integrates multiple instruments, each with its own guided chat.
Questionnaires on this platform are in **test mode** and available in Swedish, English,
and Spanish. Italian users should use
[competenzestrategiche.it](https://competenzestrategiche.it) for validated questionnaire
administration.

- **QSA** — Learning Strategies Questionnaire (Pellerey, 100 items, 14 factors).
- **QSAr** — reduced version of QSA (8 factors).
- **ZTPI** — Zimbardo Time Perspective Inventory (temporal perspective, 5 dimensions).
- **QPCS, QPCC, QAP** — questionnaires on perceived strategic competences, perceived
  citizenship competences, and professional adaptability.
- **Savickas** — narrative career construction interview.

## How it works

1. The student chooses a questionnaire and, where applicable, an **AI counselor**
   (persona/style).
2. The student completes the questionnaire or uploads an already-obtained profile.
3. The **guided chat** starts: the counselor walks the student through the results,
   step by step, encouraging reflection.
4. The system builds a **student profile** (open learner model) that updates during and
   across sessions.

## AI counselors

Counselors are configurable profiles (persona + AI model) that give tone and style to
the conversation. An administrator can create, activate, and associate them with a
model preset from the administration panel.

## Student profile (open learner model)

During the session, CounselorBot maintains conversational memory and an open learner
model of the student profile, with revisions at session start and end and a history.
This profile is used to personalize responses.

## Roles

- **Student** — completes the questionnaires and uses the guided chat.
- **Teacher** — uses the platform in educational contexts and the informational
  assistant.
- **Researcher / Administrator** — accesses the console (AI configuration, counselors,
  questionnaires, results, research contacts, costs and monitoring).

Authentication is handled via ai4auth; administrator status depends on membership in
configured groups.

## Languages

Questionnaires on CounselorBot are in **test mode**, available in Swedish, English, and
Spanish. The platform interface supports additional languages, but the core
questionnaire administration experience is limited to these three languages during the
test phase. For Italian-language questionnaires, users are directed to
[competenzestrategiche.it](https://competenzestrategiche.it).
