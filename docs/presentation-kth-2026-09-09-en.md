# KTH Presentation — 9 September 2026 — English Version

> Revised spoken script: 16 proposed slide sections, first person, with an academic focus on development, method and preliminary findings. Website slides have not yet been aligned with this structure.
> This English revision develops the Italian companion script (`presentazione-kth-2026-09-09-it.md`); the two texts are no longer aligned section by section.
> Development and evaluation data: `Counselorbot-versione-v40-202606191545.docx`, §§3–6. These figures describe the manuscript's study snapshot, not current platform totals.
> Reading estimate: 30–35 minutes; allow approximately 35–40 minutes with pauses and transitions. Demo and discussion excluded.

---

## Slide 1 — Who I am

**Slide bullets (working outline):**

- Daniele Dragoni — visiting PhD researcher at KTH, May–October 2026
- Roma Tre University — doctoral research on AI and education
- Returning to university while working: a personal connection to lifelong learning

### Talk (≈ 1.2–1.4 min reading)

Good morning, everyone.

My name is Daniele Dragoni. I am a visiting PhD researcher from Roma Tre University, and my stay at KTH runs from May to October. My doctoral research concerns AI and education, and today I will present CounselorBot: a system developed to support reflection in educational and career guidance.

My interest in this subject also has a personal dimension. I returned to university while working, to complete a bachelor's degree I had left unfinished. With the support of people who encouraged me to continue, I went on to study cognitive science, then e-learning and media education, and eventually began my PhD.

That experience made the relationship between learning, personal choices and human support very concrete for me. In Italy we say, “it is never too late to learn”. The project I will discuss today asks how AI might contribute to that process, and how we can investigate the quality of its contribution.

---

## Slide 2 — Roma Tre and its educational context

**Slide bullets (working outline):**

- Department of Education, Roma Tre University
- A tradition connected to teacher education
- Ostiense: former industrial spaces integrated into university life

### Talk (≈ 1.0–1.1 min reading)

A few words about the context of this work. I come from the Department of Education at Roma Tre University. The university carries on the tradition of Rome’s Magistero, an institution dedicated to teacher education.

Roma Tre has also helped revitalise Ostiense, a former industrial district of Rome where disused factories and neglected spaces have been transformed into university buildings. By bringing students, teaching and research into the neighbourhood, the university has contributed to giving the area new life. This reminds me of places here in Stockholm, such as Fotografiska, where I see a similar connection between the reuse of older buildings, culture and urban renewal.

My project develops within this educational context, through the work of my research group on strategic competences and guidance.

---

## Slide 3 — From Alfa Romeo to Roma Tre

*Visual comparison only: historical premises and the humanities courtyard (2001).*

---

## Slide 4 — From slaughterhouse to architecture school

*Visual comparison only: historical Mattatoio and restored pavilion 2B.*

---

## Slide 5 — Why I chose Sweden

**Slide bullets (working outline):**

- Environmental engagement: the defence of the elm trees in Kungsträdgården
- Equal opportunities: shared parental leave
- Innovation: Spotify
- Stockholm as a place to complete my doctoral research and work on my thesis

### Talk (≈ 0.9–1.0 min reading)

I would also like to explain why I chose Sweden for my research stay. Three aspects particularly interested me: its environmental engagement, its commitment to equal opportunities, and its capacity for innovation.

The defence of the elm trees in Kungsträdgården is an example of citizens taking action to protect their environment. Shared parental leave reflects a commitment to making equal opportunities part of everyday family life. And Spotify is an example of how an idea can develop into an innovation with international reach.

These aspects made me curious about Sweden and Stockholm. I thought this would be a stimulating place to spend six months, complete my doctoral research and work on my thesis.

---

## Slide 6 — CounselorBot: why, and three questions

**Slide bullets:**

- Understanding questionnaire results and connecting them to one's own experience requires support
- Time for individual discussions with teachers, tutors and guidance counsellors is limited
- CounselorBot: additional support for reflection, connected to human guidance
- **Q1** — Is it possible to build a counselling chatbot for educational and career guidance? Are the technologies mature enough?
- **Q2** — Can it really help students interpret questionnaire results and reflect on their choices?
- **Q3** — Can we create a safe space for students' data and reflection, leaving them in control of what they share?

### Talk (≈ 3.2–3.8 min reading)

And now, after this brief introduction, let us come to the heart of the presentation.

One of my PhD projects concerns the use of AI to support students in the guidance process. It is in this context that I developed CounselorBot.

The starting point is a concrete problem. We have various guidance tools, such as self-assessment questionnaires and interviews, that help students explore learning strategies, abilities, interests and aspirations. But receiving questionnaire results does not necessarily mean understanding them or knowing how to connect them to one's own experience.

Usually, a teacher, tutor or guidance counsellor supports this step: they help the student read the results, ask themselves whether they recognise themselves in them, and reflect on concrete situations. The time available, however, does not always allow every student to have an in-depth individual discussion.

There is a second motivation as well. Students use AI to look for information and study, but also to ask for advice about study choices, work and aspects of their lives. General-purpose systems can answer these questions, but they are not specifically designed for educational guidance. Their ability to sustain a conversation could support educational guidance. The question is how to design that conversation so that it helps students understand their results and reflect on their own experiences.

The idea behind CounselorBot is to offer an additional tool with which students can explore their results, ask questions and reflect on themselves. This conversation can become a starting point for a subsequent discussion with a teacher or guidance counsellor, who retains their role in supporting the student.

Together with my research group and my supervisor, we asked ourselves three questions.

The first: is it possible to build a chatbot that plays a counselling role in guidance? Do we already have the necessary technologies? Are they mature enough to support this kind of interaction?

The second: can it really help students read and interpret questionnaire results? Can it help them connect those results to their own experience? Do the questions it asks stimulate reflection? Can it support them in exploring their choices, leaving them room to reach their own conclusions?

The third: can we create a safe space where students can store their data and reflect on their experiences? How can we protect this information and leave students in control of what they share?

I will first explain the pedagogical framework, then the two development cycles and the exploratory evaluation. Finally, I will distinguish what these findings tell us from the questions that remain open.

---

## Slide 7 — What guidance means (and why it is not matching)

**Slide bullets:**

- The classic answer: *matching* — measure the person, catalogue the jobs, match them up (Parsons, 1909)
- It rests on two forms of stability that no longer exist: a stable person, a stable market
- Pellerey: guidance = **directing oneself** in study and work
  - **Self-determination** — values, motives, meaning, an existential perspective
  - **Self-regulation** — planning, monitoring, persisting, attributing causes
- Savickas: a career is not discovered, it is *constructed* — the key construct is adaptability
- Self-regulation requires explicit educational support

### Talk (≈ 4.2–4.9 min reading)

At this point, it is useful to clarify what we mean by guidance. For a long time, this term has been associated with *matching*: the work of matching a person's interests and abilities to a job or a course of study.

The appeal of this model is obvious. It is neat, it is measurable, it produces a clear output: the student takes a test and receives a list of suitable occupations. It looks like science. And in part it is: it comes from Frank Parsons, from the early twentieth century, and has more than a century of use behind it.

But for us, this is not enough. Guidance should mean helping people develop themselves, develop the competences and skills that enable them to fulfil their aspirations and live a satisfying life — taking account of the context they are in, which means respecting the environment and other people's work.

And there is also a technical reason why matching is no longer enough. Michele Pellerey — emeritus professor, the intellectual father of this tradition in Italy — puts it clearly: the matching model rests on two assumptions of stability that no longer hold today. The first is a stable person, as if a sixteen-year-old's aptitudes were settled facts, waiting to be measured. The second is a stable market, as if the world of work would politely stand still while we make our diagnosis. But the market is not standing still: automation, digitalisation, artificial intelligence, polarisation of occupations. You cannot read a young person's future employability from current market demand, because that demand will already have changed by the time they enter the labour market. A matching model, taken seriously, optimises people for yesterday's jobs.

What replaces it? Two complementary answers.

The first is Pellerey's: guidance as the ability to **direct oneself**. Not a moment, but a competence, with two pillars. The first is self-determination: the strategic component, the ability to choose where to go — values, motives, ideals, and a sense of one's own life, an existential perspective. Without that, no amount of career information helps, because there is no "you" making the choice. The second pillar is self-regulation: the operational component. Once you have a direction, you need to manage the journey — plan, monitor, persist, and above all attribute causes correctly. Did I fail because I am incapable, or because I studied using the wrong strategy? That attribution determines whether a student tries again.

The second answer is Mark Savickas's: *career construction*, *life designing*. A career is not the discovery of a fit that already existed; it is something a person constructs, a story they tell and revise, in which work is one chapter. The key construct becomes adaptability, not fit.

This raises an educational question: how can we help students develop self-regulation? The transition to university, for example, requires them to organise their studies more independently. Supporting this transition means helping students recognise their strategies, evaluate them and change them when they do not work.

Notice what changes. The goal is no longer the right answer, but the right process. And the right process consists of conversation and reflection. Which is exactly what conversational AI could support — if it is built to support that process, rather than to sell answers.

---

## Slide 8 — Development methodology: two ADDIE cycles

**Slide bullets (working outline):**

- ADDIE: **Analysis, Design, Development, Implementation, Evaluation** (Branch, 2009)
- Cycle 1: **CB-C**, an open conversational prototype with RAG and a system prompt
- Participant feedback informed the redesign
- Cycle 2: **CB-SBS**, a guided step-by-step version
- The v40 study reports evaluation within the second development cycle

### Talk (≈ 2.2–2.6 min reading)

To organise the development process, we adopted ADDIE: Analysis, Design, Development, Implementation and Evaluation. We used this framework across two iterative development cycles, using participant feedback to inform the redesign of the system.

In the analysis phase, we identified the need for support in interpreting questionnaire results and connecting them to personal experience. In design, we translated this need and the pedagogical framework into requirements for the interaction. Development concerned building the prototype; implementation concerned its use by participants; and evaluation provided information for the next revision.

The first cycle produced CB-C, the conversational version. It used a system prompt and retrieval-augmented generation, or RAG: relevant information was retrieved from indexed documents and supplied to the language model. The conversation did not follow a predetermined sequence.

Feedback from this version highlighted practical difficulties, particularly entering scores and maintaining consistency between the information supplied and the analysis. These observations informed a second cycle, which produced CB-SBS, the step-by-step version. Here, the application organises the interaction into a guided sequence and supplies the model with the context needed for each step.

The study I am drawing on reports the evaluation stage of this second cycle. Its purpose was to inform further development. ADDIE describes how we organised that process; the comparison between participant groups describes how we investigated their experience. Keeping these two levels distinct helps clarify what the study can establish.

My own background is in education and the humanities, and I developed the platform largely with AI assistance. This is a characteristic of the development process: I supplied the domain requirements and reviewed the resulting behaviour through successive revisions. It is also a reason to make the design decisions and their evaluation explicit.

---

## Slide 9 — The QSA as the focus of the evaluation

**Slide bullets (working outline):**

- The project builds on **competenzestrategiche.it** and the research group's work
- QSA: cognitive, affective and motivational dimensions of learning strategies
- Questionnaire results become a starting point for conversation
- The reported evaluation concerns the **QSA pathway**
- Other instruments and multilingual versions require their own evaluation

### Talk (≈ 1.8–2.1 min reading)

The project builds on the work of my research group and on competenzestrategiche.it, the platform developed with support from CNOS-FAP. Students complete questionnaires there and receive a profile. CounselorBot uses that profile as a starting point for conversation.

For the evaluation I will present, the instrument was the QSA, the Learning Strategies Questionnaire developed by Michele Pellerey. It explores cognitive strategies and affective and motivational dimensions involved in studying, including anxiety, perseverance and ways of explaining success and failure.

A result can open a question: do I recognise myself in this description? In which situations? Can I recall an experience that supports it, or one that makes me interpret it differently? These connections between scores and experience are central to the intended interaction.

The current platform also includes other questionnaires, narrative paths inspired by Savickas, reflection on significant experiences, IDEA for developing a thought, and PQBL for exploring documents through questions. This wider range describes the current application. The comparative findings I will show concern the QSA pathway and should not be extended to all these instruments.

All the application pathways remain under testing. A questionnaire's existing validation does not establish the quality of an AI conversation built around its results. Multilingual versions introduce a further task: reviewing translations and studying the instruments in their new linguistic and cultural contexts. That work is separate from the evaluation reported here.

---

## Slide 10 — From user feedback to redesign

**Slide bullets (working outline):**

- Score-entry difficulties → structured form and PDF upload
- Inconsistent summaries and missing information → revised session memory and scores supplied at every turn
- Long responses → response-length limits
- Open conversation → a guided sequence with step-specific instructions
- These changes form a combined redesign; their individual effects have not been isolated

### Talk (≈ 2.2–2.6 min reading)

Let me make the connection between evaluation and redesign more concrete.

In the first version, three participants reported difficulties entering scores manually. One explicitly asked to upload a PDF. In the second cycle, we introduced a structured initial form and direct upload of the results PDF. This changed how the data entered the conversation.

Another participant reported inconsistencies between the supplied data and the final summaries, and another observed that the chatbot forgot information. The redesign revised session memory through dynamic summaries of the dialogue and by supplying the questionnaire scores at every turn. These measures were intended to keep the analysis connected to the original profile.

A participant also asked for shorter responses. We introduced a response-length limit to help contain the model's interventions. However, controlling length is only part of the problem: the response also has to leave enough space for the student to think and answer. Context management and response calibration remained areas for further development.

The broader change was the guided sequence. In CB-SBS, the application tracks the current step and assembles the relevant data, instructions, conversation context and retrieved educational material. The model generates its response within this structure. Strategies are linked to curated educational content, and the application specifies when they should be offered. Testing must still establish how consistently the generated responses follow these requirements.

The platform uses a FastAPI backend, a Next.js interface and PostgreSQL, with support for local and external language models. For this study, the important architectural point is how the application organises the model's interaction with the student.

Several components changed together: the interface, the guided sequence, memory management and response constraints. The comparison therefore concerns two configurations of the system. It cannot identify the independent contribution of each change.

---

## Slide 11 — Exploratory evaluation: participants and procedure

**Slide bullets (working outline):**

- Between-subjects comparison: each participant used **one version**
- **34 participants:** CB-C 27; CB-SBS 7
- Numerical ratings: **22 participants**, CB-C 16; CB-SBS 6
- Open responses: **11 participants**, all CB-C
- QSA → profile → chatbot interaction → experience questionnaire
- **10 experience items** and **2 open questions**; descriptive item-level analysis

### Talk (≈ 2.0–2.4 min reading)

I will now present the exploratory evaluation reported in version forty of the manuscript. These figures describe that study snapshot; they are not an updated count of platform use in September.

The study used a between-subjects comparison: each participant used one version of the system. The manuscript reports thirty-four participants overall, twenty-seven for CB-C and seven for CB-SBS. Participants ranged from eighteen to fifty-three years old and had different educational backgrounds. The sample was non-probabilistic, and the manuscript does not report random assignment to the versions.

It is important to distinguish participation from the number of numerical responses. Sixteen participants in CB-C and six in CB-SBS supplied numerical ratings, giving twenty-two respondents for the quantitative comparison. Eleven participants supplied open responses, all in CB-C. The reported quantitative analysis therefore uses sixteen and six, rather than twenty-seven and seven.

The procedure began with completion of the QSA and presentation of the resulting profile. Participants then interacted with the chatbot about the questionnaire factors and completed an experience questionnaire.

This questionnaire contained ten items covering aspects such as perceived usefulness, clarity, ease of use, trust, reflection and intention to use the system again or recommend it. Two open questions collected observations and suggestions. The numerical analysis compared the mean for each item separately; the items were not combined into subscales. The open responses were analysed through thematic categorisation.

This design provides information about participants' reported experience. It does not directly measure changes in learning strategies, the quality of their decisions or longer-term educational outcomes. Those would require additional measures and a different evaluation scope.

**Source note:** v40, §§3.3–3.4 and 4.2–4.3. The manuscript reports 7 CB-SBS participants but numerical ratings from 6; it does not explain the remaining participant's response status. Do not infer an exclusion reason.

---

## Slide 12 — Preliminary findings: experience of the two versions

**Slide bullets (working outline):**

- Higher mean ratings for CB-SBS on **9 of 10 items**
- Selected means shown below; **CB-C n = 16, CB-SBS n = 6**
- Perceived usefulness was slightly lower in CB-SBS
- Small, unequal groups; self-reported experience; multiple simultaneous design changes
- Descriptive findings informing development; educational effectiveness remains to be assessed

### Talk (≈ 2.4–2.8 min reading)

The guided version received higher mean ratings on nine of the ten items. I will focus on five dimensions, including the one that did not follow this pattern.

Ease of use had a mean of 3.38 in CB-C and 4.17 in CB-SBS. Trust in the information received was 3.19 and 3.83 respectively. These observations are consistent with the intended direction of the redesign, which addressed data entry and consistency. However, the comparison does not establish that those changes caused the differences.

The perceived capacity to stimulate reflection was rated 3.25 in CB-C and 3.83 in CB-SBS. Intention to reuse or recommend the system was 3.12 and 3.83. These are encouraging observations for further investigation, but a rating about reflection is not a direct assessment of the depth or quality of a participant's reflection.

Perceived usefulness was slightly lower in the guided version: 3.17, compared with 3.31 in CB-C. I would keep this result visible because it prevents us from treating ease of interaction and usefulness as interchangeable. The data do not tell us why this difference occurred.

The open responses from the first version also included positive comments on clarity, relevance and usefulness. Alongside those comments, the practical criticisms helped identify priorities for redesign. We do not have corresponding open-response evidence for CB-SBS in this dataset.

There are several limits to interpretation. The numerical groups contain only sixteen and six participants, and their composition may differ. Ratings are self-reported. Several parts of the system changed between versions, and no inferential comparison is reported here. We should therefore describe differences in the observed means, without claiming statistical significance, equivalence or a causal improvement.

For the ADDIE process, these findings provide directions for the next cycle: investigate the user experience with a larger sample, collect qualitative feedback on the guided version, and assess whether the interaction supports meaningful reflection beyond a favourable immediate rating.

**Selected item means — source: v40, §4.2**

| Item | CB-C (n = 16) | CB-SBS (n = 6) |
| --- | ---: | ---: |
| Ease of use | 3.38 | 4.17 |
| Trust in the information received | 3.19 | 3.83 |
| Perceived capacity to stimulate reflection | 3.25 | 3.83 |
| Intention to reuse / recommend | 3.12 | 3.83 |
| Perceived usefulness | 3.31 | 3.17 |

**Editorial note, not spoken:** Means are transcribed from the manuscript. The response-scale endpoints and anchors must be checked against the original questionnaire before finalising the website chart. Do not label the values “out of 5” without that check. Deltas are omitted because differences between rounded displayed means do not always match the manuscript's reported deltas.

---

## Slide 13 — Time for reflection and human support

**Slide bullets (working outline):**

- Reflection during conversation and independent writing afterwards
- Students' own spaces: **Notebook, Booklet, Portfolio**
- Teachers and tutors: discussion, feedback and follow-up
- Curated educational content supports the conversation
- Features of the current platform; their contribution requires evaluation

### Talk (≈ 1.9–2.3 min reading)

The findings raise a broader design question: what should happen around the conversation, and how much time should reflection take?

Knowledge and choices need time; they need to settle. In the current platform, students can make notes during the interaction and return to their own writing afterwards. The Notebook supports reflection on themselves, while the Booklet and Portfolio provide spaces to record and revisit their work. These are opportunities for students to formulate ideas in their own words, including without AI.

Human support is part of this design. Teachers can work with groups, review the material made available within the platform's access arrangements, write notes and continue the discussion. The intention is that a conversation with CounselorBot can prepare or enrich a subsequent exchange with a teacher, tutor or guidance counsellor.

The same educational responsibility applies to the content used by the chatbot. Strategies and reading recommendations draw on curated material. Their source and their relevance to the student's situation should remain open to examination.

I want to distinguish these features of the current platform from the evidence just presented. The small comparative study does not establish the effects of the Notebook, Portfolio or teacher involvement. They express the direction of the design and introduce further questions for evaluation: do students return to their notes? Do they revise their interpretation? Does the material help a subsequent human conversation?

These questions connect the immediate experience of using the interface to the wider guidance process that we ultimately want to support.

---

## Slide 14 — Data protection and local AI (Q3)

**Slide bullets:**

- Support for external services and **local models** (Ollama, llama.cpp)
- Local models: processing on the server; keeping data within the system requires checking the entire configuration, including connected services
- **Protection layer under testing**: handling identifying information before sending it to external services; anonymisation still to be verified
- Research: administration plans, informed consent, **research codes**, item-level export
- Human review of translations and questionnaire validation: two distinct steps
- Data minimisation, access, retention and sharing: requirements to examine in context

### Talk (≈ 2.7–3.1 min reading)

The third question, and for me the most difficult: how can we make tools like these safe in terms of privacy, confidentiality and data?

Let me start with an architectural choice. CounselorBot can route requests to external providers, but it also supports local models through Ollama and llama.cpp. Local models are useful for demonstrations, cost control, offline or low-budget operation — and also for processing conversations on one's own server. However, keeping data within the system requires checking the entire configuration, including any connected external services. External providers remain useful when quality, latency or specific capabilities matter.

When building CounselorBot, we kept both paths open. The choice depends on response quality, waiting times, available resources and data protection requirements. Comparing local models and external services is one of the research developments.

This decision must be explicit. The data protection layer is designed to identify and handle identifying information before it is sent to external services. It is still being tested: we need to check which information it recognises and which may slip through. Removing names or email addresses alone does not demonstrate that a conversation is anonymous. Retention, access and sharing are also part of the data protection work.

On the research side, the platform provides for administration plans, informed consent and research codes. Item-level export supports psychometric analysis. Using codes helps separate results from participants' identities, but the possibilities of linking data back to a person also need to be checked.

For multilingual versions, we distinguish two steps. Human review is used to check translation quality. Validation, on the other hand, requires studies of the instrument in the new linguistic and cultural context. The versions in CounselorBot still need to go through this process, which remains a future research development.

The design must therefore also take account of the applicable obligations concerning data protection and AI use. For the project, this means clarifying what data is needed, where it is stored, who can access it and how to inform the people involved. These conditions need to be checked in the actual context of use.

---

## Slide 15 — What I am looking for at KTH and next steps

**Slide bullets:**

- Possible future collaboration: **validating the QSA in Swedish** with anyone interested in involving their courses, outside the current phase of the research
  - Cognitive interviews → pilot → data collection → psychometrics (CTT, CFA) → norms
  - The manual is already written, in English
- **PQBL**: an instrument already being tested
- Next steps: fine-tuning on real QSA sessions, strengthening anonymisation and pseudonymisation, benchmarking local vs external models
- A direction still to be explored: an application on the student's computer, with local data and LLM

### Talk (≈ 2.3–2.8 min reading)

I will now turn to opportunities for collaboration and the next developments of the project.

One possible future development is validating the Swedish version of the QSA with KTH students. If any of you are interested in involving your courses, I would like to discuss this together and develop a possible collaboration. This work is outside the current phase of the research. Cognitive interviews, a pilot study, data collection, then psychometrics — classical test theory, confirmatory factor analysis, and finally norms. The manual is already written, in English, and the data pipeline is already in place in the platform.

For the current work, I am looking for this department's feedback on CounselorBot and on the quality of the interaction it offers. The evaluation priorities are a larger and more balanced sample, qualitative feedback on CB-SBS, and direct examination of conversations for interpretative accuracy and the quality of reflection. EECS offers a context in which we can discuss the pedagogical and engineering questions together.

PQBL, the learning path based on questions generated from documents, is already among the instruments being tested. The next steps include investigating fine-tuning on appropriately prepared QSA conversations; strengthening the anonymisation and pseudonymisation layer; and systematically comparing local and external models in terms of the quality of guidance conversations.

One direction we have not yet explored is an application that runs entirely on the student's computer, with the data and language model stored and run locally. The development of computers capable of running these models — I am thinking, for example, of Macs and NVIDIA solutions — makes this an interesting possibility to study. We will need to establish what resources are required and what quality of interaction can be achieved. The aim is to give students greater control over their data, reducing the need to send it to external services.

---

## Slide 16 — Conclusions and an invitation to take part in testing

**Slide bullets (working outline):**

- **Q1 — Technical feasibility:** a working application and two development cycles
- **Q2 — User experience:** exploratory findings; educational effectiveness remains open
- **Q3 — Data protection:** architectural measures with verification still required
- ADDIE: evaluation informs the next development cycle
- **It works. Now we need to understand how much it helps.**

### Talk (≈ 2.0–2.4 min reading)

To conclude, I will return to the three questions we started with.

For the first question, the project demonstrates the technical feasibility of this application. We developed an initial conversational prototype and a guided version, and participants were able to use them in the QSA pathway. The two ADDIE cycles make it possible to explain how feedback informed the development decisions.

For the second question, we have exploratory evidence about user experience. The guided version received higher mean ratings on nine of ten items, while perceived usefulness was slightly lower. These observations justify further investigation. They do not yet establish that the system improves learning strategies, reflection or educational and career decisions.

For the third question, the platform provides architectural options for local processing and measures for access and data handling. Their adequacy still needs to be verified in the actual setting of use. A local model is one part of that work; protection also depends on the surrounding services, permissions and data practices.

This is where I would like to involve you. All the application pathways are test versions. I invite you to try the interaction critically: examine whether interpretations remain consistent with the profile, whether questions help participants explore concrete experiences, and where responses become repetitive, unclear or too directive.

Your feedback can help us define the next evaluation cycle and the evidence we need to collect. The longer-term aim is to understand how the system can contribute to guidance alongside teachers, tutors and counsellors.

It works. Now we need to understand how much it helps.

Thank you.

---

# Supporting material

## Timing

| Slide | Content | Spoken words | Reading minutes at 110–130 wpm |
| --- | --- | ---: | ---: |
| 1 | Who I am | 155 | 1.2–1.4 |
| 2 | Roma Tre and its educational context | 125 | 1.0–1.1 |
| 3 | From Alfa Romeo to Roma Tre (visual only) | 0 | — |
| 4 | From slaughterhouse to architecture school (visual only) | 0 | — |
| 5 | Why I chose Sweden | 113 | 0.9–1.0 |
| 6 | CounselorBot: why, and three questions | 418 | 3.2–3.8 |
| 7 | What guidance means (and why it is not matching) | 543 | 4.2–4.9 |
| 8 | Development methodology: two ADDIE cycles | 283 | 2.2–2.6 |
| 9 | The QSA as the focus of the evaluation | 229 | 1.8–2.1 |
| 10 | From user feedback to redesign | 291 | 2.2–2.6 |
| 11 | Exploratory evaluation: participants and procedure | 262 | 2.0–2.4 |
| 12 | Preliminary findings: experience of the two versions | 312 | 2.4–2.8 |
| 13 | Time for reflection and human support | 249 | 1.9–2.3 |
| 14 | Data protection and local AI (Q3) | 345 | 2.7–3.1 |
| 15 | What I am looking for at KTH and next steps | 304 | 2.3–2.8 |
| 16 | Conclusions and an invitation to take part in testing | 260 | 2.0–2.4 |

The revised English script contains **3,889 spoken words**, counted as whitespace-separated words in the Talk sections only. Slide bullets, the results table, source notes and supporting material are excluded. Reading requires approximately **30–35 minutes**; allow **35–40 minutes** with pauses and transitions. Discussion and any demo require additional time. Check the estimate by rehearsing aloud, particularly the numerical results.

## Cut plan (if you run over)

- Slide 2: reduce the institutional introduction to one sentence.
- Slide 7: shorten the discussion of matching, retaining self-determination, self-regulation and Savickas's distinct contribution.
- Slide 9: mention the other instruments briefly and preserve the QSA evaluation boundary.
- Slide 14: shorten the examples of local-model use.
- Slide 15: summarise future technical developments, preserving evaluation priorities and the invitation to collaborate.
- Preserve the participant denominators, the perceived-usefulness result and the limits of the comparison in slides 11–12.

## Delivery notes

- Slides 1–2: keep a personal opening while moving promptly to the research problem.
- Slide 5: explain the three personal reasons for choosing Sweden, matching the photographs on the website.
- Slide 8: explain what happened in each development cycle; use ADDIE to connect decisions and evidence.
- Slide 10: connect each reported difficulty to its corresponding design response without claiming complete resolution.
- Slide 11: distinguish 34 participants overall from 22 numerical respondents. These are historical study figures.
- Slide 12: read a few selected values slowly. Keep perceived usefulness visible and explain that the findings are descriptive.
- Slide 13: distinguish current platform features from the scope of the reported evaluation.
- Slide 16: return to all three questions, separating technical feasibility, user experience and educational effectiveness.

## Likely questions

1. **"Is ADDIE your experimental design?"** — ADDIE organised iterative development. The evaluation used a between-subjects comparison of two versions, with descriptive item-level analysis and thematic categorisation of open responses.
2. **"Were participants randomly assigned?"** — The manuscript reports a non-probabilistic sample and does not report random assignment. Group differences and simultaneous design changes limit causal interpretation.
3. **"Why 34 participants but only 22 numerical respondents?"** — CB-C had 27 participants: 16 provided numerical ratings and 11 open responses only. CB-SBS had 7 participants, with numerical ratings reported for 6. The manuscript does not explain the remaining participant's response status.
4. **"Does the guided version work better?"** — It received higher mean ratings on 9 of 10 experience items in this small sample. Perceived usefulness was slightly lower. This does not establish superiority or improved educational outcomes.
5. **"Why isn't a good prompt enough?"** — The application also manages the guided sequence, profile data, retrieved content and conversation context. Their combined contribution needs evaluation.
6. **"How do you establish the quality of advice?"** — The design uses curated strategies and step-specific constraints. Evaluation should examine actual conversations for interpretative accuracy, relevance and adherence to those constraints.
7. **"Is the system validated?"** — The reported study is exploratory. Questionnaire validation, validation of translated instruments, and evaluation of AI-mediated interaction are separate tasks.
8. **"What about privacy?"** — Local processing and access and data-handling measures are part of the design. Their adequacy requires checks in the actual deployment and context of use.
9. **"How did you develop it with AI assistance?"** — I supplied the educational requirements and used AI assistance in implementation, with iterative review of the resulting behaviour. This describes the development process; it is not a separate evaluation of AI-assisted programming.

## Checks before finalising the website slides

- [ ] Confirm response-scale endpoints and anchors from the original experience questionnaire before labelling a chart.
- [ ] Clarify the response status of the seventh CB-SBS participant if the original records are available; retain n = 6 for the reported means.
- [ ] Keep v40 study figures separate from any subsequently verified platform usage totals.
- [ ] Verify model identifiers, configuration, benchmark protocol and automated evaluator before using technical benchmark figures in backup slides.
- [ ] Align website slides with the revised script after review.
- [ ] Define how to collect expressions of interest and testing feedback.
- [ ] If a demo is included, establish its duration and prepare backup screenshots.

## Sources

- Counselorbot manuscript, `Counselorbot-versione-v40-202606191545.docx`, supplied source in `/home/nugh75/TD_daniele/01_Articoli/Counselorbot/articoli/`: §3.1 (ADDIE and two development cycles); §§3.3–3.4 (participants, procedure and instruments); §§4.2–4.3 (numerical and open responses); §§5–6 (interpretation and limitations). No raw-data reanalysis was performed for this script revision.
- Branch, R. M. (2009). *Instructional Design: The ADDIE Approach*. Springer. DOI: 10.1007/978-0-387-09506-6. Reference reported in the supplied manuscript.
- Pellerey M., *Orientamento come potenziamento della persona umana in vista della sua occupabilità*, Rassegna CNOS, 1 (2016), pp. 41–50.
- Pellerey M., Margottini M., Ottone E. (eds.), *Dirigere se stessi nello studio e nel lavoro*, Roma TrE-Press, 2020.
- Epifani F., Margottini M., Ottone E., *Guida all'uso della piattaforma competenzestrategiche.it*, CNOS-FAP, 3rd ed., 2023.
- Greene J., *Self-Regulation in Education*, Routledge, 2018.
- Savickas M. L., *Career Studies and Life Designing: Self-Making*, 2024.
- Savickas M. L., Porfeli E. J., *Career Adapt-Abilities Scale*, 2012.
- Zimbardo P. G., Boyd J. N., *Putting time in perspective*, JPSP, 1999.
- EU Council Recommendation on Key Competences for Lifelong Learning (2018).
