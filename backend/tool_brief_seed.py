"""Seed idempotente delle spiegazioni lunghe degli strumenti (`orientation_tool_briefs`).

Testi in **inglese**: sono istruzioni per il modello, non testo mostrato allo
studente, e gli LLM reggono il cambio di lingua. Una sola stesura invece di sei
traduzioni da tenere allineate.

Quattro voci fisse per ogni strumento. L'ultima, WHAT IT DOES NOT DO, e' quella
che rende credibile una raccomandazione: dire che cosa uno strumento non dara'
e' cio' che permette allo studente di fidarsi di quello che dara'.

Il seed crea solo le righe mancanti: un testo gia' modificato dall'admin non
viene mai sovrascritto.
"""
from __future__ import annotations


TOOL_BRIEFS: dict[str, str] = {
    "QSA": (
        "WHAT IT LOOKS AT — Fourteen factors covering how the student actually studies, on two "
        "sides. The cognitive side: elaborating material rather than rereading it, self-regulating "
        "the work, building graphic organisers, questioning oneself while studying, collaborating, "
        "and against these, disorientation and difficulty holding attention. The affective side: "
        "volition, perceived competence, how the student explains their own results, and against "
        "these, test anxiety, emotional interference and lack of perseverance.\n"
        "WHAT YOU GET — A profile factor by factor, each placed on a 1-9 band read as strength, "
        "adequate or area to grow, grouped into the cognitive and affective dimensions. Six of the "
        "fourteen factors are counted the other way round, so a high score there marks something to "
        "work on rather than a resource. Afterwards a guided conversation reads the profile with "
        "the student, factor by factor, and ends in one practical action.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student wants to understand how they study before "
        "deciding what to change; when effort and results do not match; when method has never been "
        "examined, only outcomes. It is the fullest map of the six questionnaires, and the right "
        "starting point when there is time for depth.\n"
        "WHAT IT DOES NOT DO — It does not measure ability or intelligence, does not predict a "
        "grade, and does not say what to study. It reports how the student describes their own way "
        "of studying: self-perception, which the conversation then puts next to what actually "
        "happens. The shorter path over the same ground is QSAr."
    ),
    "QSAr": (
        "WHAT IT LOOKS AT — The same ground as QSA in eight factors instead of fourteen: "
        "elaborative and self-regulatory strategies, graphic strategies, volition, perceived "
        "competence, controllable causal attributions, and against these, difficulty controlling "
        "attention and difficulty regulating anxiety.\n"
        "WHAT YOU GET — A profile on the same 1-9 bands, coarser than QSA but read the same way, "
        "with the same guided conversation afterwards. Two of the eight factors are counted the "
        "other way round.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student wants a first picture of how they study "
        "without committing to the long form; when time or attention is short; when the point is to "
        "start a conversation rather than to map every corner. Moving to QSA later is a normal "
        "step, not a repetition.\n"
        "WHAT IT DOES NOT DO — It does not give the item-by-item depth of QSA, so it will not "
        "separate, say, self-questioning from graphic organisers: it merges them. Like QSA it "
        "measures self-perception, not ability, and predicts nothing."
    ),
    "ZTPI": (
        "WHAT IT LOOKS AT — How the student stands towards time, in five orientations: a past "
        "remembered as negative or as positive, a present lived hedonistically or fatalistically, "
        "and a future used for planning. Time perspective is a habit of attention, and it shapes "
        "motivation, procrastination and the way choices get made or postponed.\n"
        "WHAT YOU GET — A profile on the five orientations, each on a 1-9 scale, read against a "
        "balanced time perspective: for every orientation there is a band that is favourable and "
        "bands that are further from it, so the reading is not simply high-is-good. Then a guided "
        "conversation on what that balance means for study and for decisions.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student postpones, or lives study as something "
        "always urgent and never planned; when a past experience keeps colouring present choices; "
        "when the difficulty is not method but direction and time horizon.\n"
        "WHAT IT DOES NOT DO — It does not look at study strategies: for those, QSA or QSAr. It is "
        "not a personality test and not a diagnosis of procrastination; it describes a relationship "
        "with time that the student can recognise and work on."
    ),
    "QPCS": (
        "WHAT IT LOOKS AT — Five strategic competences as the student perceives them: managing "
        "one's own emotions, communicative competence, will and perseverance, strategies and "
        "collaboration, and confidence together with a sense of a life project.\n"
        "WHAT YOU GET — A profile on the five areas, and a guided conversation that works on the "
        "gap between what the student believes they can do and what they find themselves doing. "
        "It is a reflective interview more than a measurement.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the obstacle is not method but the picture the student "
        "has of themselves: feeling unable to speak up, to keep going, to organise with others. It "
        "pairs well with QSA, which says how they study, while this says what they believe they are "
        "capable of.\n"
        "WHAT IT DOES NOT DO — It does not certify a competence and does not compare the student "
        "with anyone else. Perceived competence and demonstrated competence come apart, often in "
        "both directions, and this instrument only sees the first."
    ),
    "QPCC": (
        "WHAT IT LOOKS AT — Five areas where competences and beliefs about oneself meet: speaking "
        "in public, managing anxiety and responsibility, volition and self-regulation, elaboration "
        "strategies, and the beliefs the student holds about themselves.\n"
        "WHAT YOU GET — A profile on the five areas and a conversation that treats a low score as a "
        "belief to examine rather than a verdict. Beliefs about oneself are the one factor here "
        "that changes what the others can do.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student says some version of 'I am just not the "
        "kind of person who can do this'; when anxiety and responsibility are the thing in the way; "
        "when the question is less about technique than about self-image.\n"
        "WHAT IT DOES NOT DO — It is not a clinical instrument and does not assess anxiety as a "
        "condition. It stays with what the student says about themselves in the context of study, "
        "and it does not replace support of another kind when that is what is needed."
    ),
    "QAP": (
        "WHAT IT LOOKS AT — Four resources for facing change and transition: concern for one's own "
        "future, a sense of control over it, curiosity about the possibilities out there, and "
        "confidence in being able to carry out what one decides. Together they describe how "
        "equipped the student is for a passage, not what they should choose.\n"
        "WHAT YOU GET — A profile on the four resources, and a guided conversation on which of them "
        "is available to lean on and which needs building before a decision gets made.\n"
        "WHEN IT IS THE RIGHT MOMENT — In front of a passage: end of a course, a choice of "
        "faculty, a change of direction, entering work. Also when the student feels stuck in front "
        "of a decision without knowing which part of it is the hard part.\n"
        "WHAT IT DOES NOT DO — It does not suggest a career, a faculty or a job, and it does not "
        "match the student with an occupation. It says what they can rely on while deciding. For "
        "the story behind the decision, SAVICKAS; for a decision already named, IDEA."
    ),
    "SAVICKAS": (
        "WHAT IT LOOKS AT — The student's own story, through the five questions of the Career "
        "Construction Interview: the people they admired growing up, what they read and watch, the "
        "stories that stay with them, a motto, and their earliest memories. Each answer is material, "
        "not a score: taken together they show a theme the student has been repeating without "
        "naming it.\n"
        "WHAT YOU GET — A conversation, and at the end a narrative thread that connects those "
        "answers into a direction. Nothing to fill in beforehand, no numbers, no profile: the "
        "output is language the student can use about themselves.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the difficulty is not information but meaning; when a "
        "questionnaire has given factors and they sit there without a story around them; when the "
        "student can describe their situation but not why it matters to them. It runs inside "
        "CounselorBot, in any language.\n"
        "WHAT IT DOES NOT DO — It does not measure anything and produces no profile, so it cannot "
        "be compared over time the way a questionnaire can. It asks for memory and openness, which "
        "takes more of the student than answering items, and it is not the right move for someone "
        "who wants a quick picture."
    ),
    "EVENTO_STUDIO": (
        "WHAT IT LOOKS AT — One single episode from the student's studies that stayed with them: a "
        "lesson, an exam, a group project, an internship day. It becomes significant because the "
        "student chose it, not because it was dramatic.\n"
        "WHAT YOU GET — A guided interview in six steps: the event, what happened (facts kept apart "
        "from judgement), what worked, what did not, a second look through concepts they know, and "
        "one thing to try next time. At the end a summary the student can save as a milestone in their Timeline. "
        "No score, no questionnaire.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student brings a concrete episode they keep thinking "
        "about, good or bad, and wants to understand it rather than judge it; after a placement or "
        "a difficult exam; when a profile result needs an example from real life.\n"
        "WHAT IT DOES NOT DO — It does not look at the whole story (that is SAVICKAS) or bring an "
        "idea into focus (that is IDEA), and it does not assess anyone else involved: other people "
        "are named by role only."
    ),
    "EVENTO_PROFESSIONALE": (
        "WHAT IT LOOKS AT — One single episode from the person's work or placement that stayed with "
        "them: a meeting, a conversation with a colleague or a client, a task, a lesson taught. It "
        "becomes significant because the person chose it, not because it was dramatic.\n"
        "WHAT YOU GET — A guided interview in six steps: the event, what happened (facts kept apart "
        "from judgement), what worked, what did not, a second look through concepts they know, and "
        "one thing to try next time. At the end a summary they can save as a milestone in their Timeline. No score, "
        "no questionnaire.\n"
        "WHEN IT IS THE RIGHT MOMENT — For adults and trainees who reflect on their practice, such "
        "as teachers in training after a lesson or a staff meeting; for students after a placement "
        "or a first job experience.\n"
        "WHAT IT DOES NOT DO — It does not measure career adaptability (that is QAP) or retell the "
        "whole career story (that is SAVICKAS), and it does not assess anyone else involved: other "
        "people are named by role only."
    ),
    "OBIETTIVO_STUDIO": (
        "WHAT IT LOOKS AT — One learning objective the student wants to set for themselves, in any "
        "area of study or work: from a vague wish ('get better at writing') to a specific, "
        "challenging, measurable goal with a small plan and a proof of success.\n"
        "WHAT YOU GET — A guided conversation in seven steps: the starting area, the level with "
        "Bloom's taxonomy, the SMART check, a challenge and learning-orientation check, first steps "
        "with an if-then plan, and one proof with a check date. At the end the objective can be "
        "saved in the personal goals area. No score, no questionnaire.\n"
        "WHEN IT IS THE RIGHT MOMENT — When the student says they want to learn or improve something "
        "but cannot say what exactly would count as success; after a profile result they want to "
        "turn into action; before planning a study period.\n"
        "WHAT IT DOES NOT DO — It does not choose the objective for the person, does not treat it "
        "as a grade or an assessment, and does not retell a past event (that is EVENTO_STUDIO). The "
        "teacher designing objectives for a class needs OBIETTIVO_DOCENZA instead."
    ),
    "OBIETTIVO_DOCENZA": (
        "WHAT IT LOOKS AT — One didactic objective a teacher wants to set for a class or group: "
        "what students should be able to do by the end, at which level, and with which activities "
        "and assessment.\n"
        "WHAT YOU GET — A guided conversation in seven steps: the class and starting area, the level "
        "with Bloom's taxonomy, the SMART check, a challenge and learning-orientation check, then "
        "alignment (constructive alignment by Biggs, backward design by Wiggins and McTighe): "
        "activities that practise what the objective asks and an assessment planned before teaching. "
        "At the end the objective can be saved among the teacher's own goals, published in their "
        "goal catalog or assigned to a group, all on explicit confirmation. No score, no questionnaire.\n"
        "WHEN IT IS THE RIGHT MOMENT — When a teacher is planning a unit or a course and wants "
        "objectives that hold together with activities and assessment, or when objectives are stated "
        "in vague terms ('understand', 'know about') and need a real level.\n"
        "WHAT IT DOES NOT DO — It does not design the lesson plan for the teacher, does not grade "
        "anyone, and does not set the teacher's own personal learning objective (that is "
        "OBIETTIVO_STUDIO)."
    ),
    "IDEA": (
        "WHAT IT LOOKS AT — One idea, decision or project the student already carries, and works to "
        "bring it into focus: what it actually is, what it depends on, what is missing, what the "
        "next step would be.\n"
        "WHAT YOU GET — A map that grows with every turn — nodes, connections, open branches — and "
        "that belongs to the student. It can be reopened, extended, and eventually become a piece "
        "of work in the Portfolio. No score, no questionnaire.\n"
        "WHEN IT IS THE RIGHT MOMENT — Only when the student names something concrete of their own: "
        "a thesis subject, a choice between two paths, a project, a concept they want to think "
        "through. That is the precondition.\n"
        "WHAT IT DOES NOT DO — It is not for a student who does not yet know what they are looking "
        "for: with nothing to focus on it has nothing to work with, and the Compass should ask "
        "about the area of interest instead. It does not decide for the student and does not "
        "evaluate the idea."
    ),
    "pqbl": (
        "WHAT IT LOOKS AT — A study text the student brings: a PDF of a chapter, an article, a set "
        "of notes. The material is theirs, not a catalogue.\n"
        "WHAT YOU GET — Multiple-choice questions generated from that text, each with formative "
        "feedback, so the student learns by answering rather than by rereading. At the end, a "
        "summary of what came right first time and what needed a second pass, broken down by "
        "skill.\n"
        "WHEN IT IS THE RIGHT MOMENT — When there is a concrete text and an exam or a deadline; "
        "when rereading has stopped working; and as the practical follow-up to a QSA or QSAr "
        "profile, where a strategy that came out weak can be exercised on real material instead of "
        "discussed in the abstract.\n"
        "WHAT IT DOES NOT DO — It produces no profile and says nothing about the student as a "
        "learner: it is practice, not assessment. The questions are only as good as the text "
        "provided, and it does not replace studying the material."
    ),
}


def seed_tool_briefs(db, models) -> int:
    """Crea le spiegazioni mancanti. Non tocca mai una riga già presente."""
    existing = {row.tool_id for row in db.query(models.OrientationToolBrief.tool_id).all()}
    created = 0
    for tool_id, brief in TOOL_BRIEFS.items():
        if tool_id in existing:
            continue
        db.add(models.OrientationToolBrief(tool_id=tool_id, brief=brief.strip(), is_active=True))
        created += 1
    if created:
        db.commit()
    return created
