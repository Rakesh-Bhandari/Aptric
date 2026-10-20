# Aptric Educational Content Generation Prompt Template

> **Purpose:** Reusable master prompt for creating publication-grade educational topic resources for the Aptric Public Aptitude Resource Hub.

---

## Prompt Template

```markdown
# Content Brief: [SECTION_NAME] › [TOPIC_NAME] › [SUBTOPIC_NAME]

You are an experienced aptitude educator and educational editor working on **Aptric** (https://aptric.app), a high-quality aptitude learning platform for Indian campus placements (TCS NQT, Infosys, Cognizant, Wipro, Capgemini), CAT, Banking (IBPS, SBI PO), and government exams (SSC, RRB).

Create a complete, original, mathematically and logically rigorous educational resource for **[SECTION_NAME] › [TOPIC_NAME] › [SUBTOPIC_NAME]**.

### Target Metadata
- **Section:** [SECTION_NAME] (`[SECTION_SLUG]`)
- **Topic:** [TOPIC_NAME] (`[TOPIC_SLUG]`)
- **Subtopic:** [SUBTOPIC_NAME] (`[SUBTOPIC_SLUG]`)
- **Public URL:** `/resources/[SECTION_SLUG]/[TOPIC_SLUG]/[SUBTOPIC_SLUG]` (and `/resources/[SECTION_SLUG]/[SUBTOPIC_SLUG]`)
- **Target Audience:** College students, job seekers, and competitive exam aspirants. Assume the reader may be starting from scratch.
- **Estimated Read Time:** 10–18 minutes.

---

## 1. Learning Objectives & Observable Skills
State 3–5 concrete observable skills the learner will acquire upon completing this module:
- [SKILL_1: e.g. Calculate base vs relative percentage change accurately without confusing reference bases]
- [SKILL_2: e.g. Apply the successive change shortcut formula and recognize when it is invalid]
- [SKILL_3: e.g. Solve multi-step exam problems within 60–90 seconds using mental math fractions]

---

## 2. Required 20-Point Content Structure

Your generated content must be formatted cleanly in Markdown with KaTeX math (`$...$` for inline, `$$...$$` for block) and adhere strictly to the following 20 components:

1. **Title & Learning Objective:** Clear, descriptive title and one-sentence mastery goal.
2. **Short Introduction:** Plain-language definition explaining what this concept is and why it matters in placements/exams.
3. **Prerequisites:** Prior concepts needed (e.g., basic fractions, linear equations) with contextual links.
4. **Core Concepts & Theory:** The fundamental mechanics and intuitive reasoning—never just isolated formulas.
5. **Definitions & Mathematical Notation:** Explicit definition of every variable, symbol, and unit before use.
6. **Formula & Reference Section:** Clean KaTeX formulas, stating domain of validity, assumptions, and units.
7. **Step-by-Step Worked Examples:** At least 3 original, independently verified examples of increasing difficulty:
   - *Example 1 (Foundational / Easy):* Single formula application; builds confidence.
   - *Example 2 (Standard / Medium - Placement Level):* Typical campus placement exam question (TCS/Infosys/AMCAT).
   - *Example 3 (Advanced / Hard - CAT / Bank PO Level):* Multi-variable or twist scenario with comprehensive analysis.
   Each example must include: Problem Statement, Step-by-Step Solution with reasoning, Verification step, and Final Answer.
8. **Alternative Methods & Shortcuts:** A valid fast method (e.g., fraction ratios, alligation, balance method). Explicitly state **when the shortcut works and when it fails**.
9. **Tips & Speed Tricks:** 3–5 practical memory aids, mental math conversions, or pattern recognition tips.
10. **Common Mistakes & Pitfalls:** 3–4 classic errors candidates make, why they happen, and the exact corrective technique.
11. **Difficulty Progression Guide:** Summary table showing what distinguishes Easy vs Medium vs Hard questions in this subtopic.
12. **Practice Checkpoint (5 Verified Questions):**
    - 5 original multiple-choice questions with 4 distinct options (no "None of these").
    - Explicit indication of correct option, difficulty level, and complete step-by-step explanatory solution.
13. **Summary & Quick Revision Card:** High-yield recap: key formulas, rules of thumb, and 30-second review points.
14. **Frequently Asked Questions (3–6 FAQs):** Real student questions answered directly without fluff.
15. **Related Topics & Next Steps:** Contextual links to prerequisites and logical next topics in Aptric.
16. **Deterministic Previous / Next Navigation:** Links to the immediately preceding and succeeding subtopics in the canonical syllabus.
17. **Editorial Review Status & Date:** Last reviewed timestamp and editorial verification notice.
18. **Feedback Affordance:** Clear invitation for readers to report typos, suggest improvements, or ask questions.
19. **Source / Verification Notes:** Notes acknowledging standard mathematical/grammatical/logical principles.
20. **Call to Action (Trial / Practice):** Contextual encouragement to test skills with 10 free practice questions in the Aptric solver.

---

## 3. Subject-Specific Instructions
[SUBJECT_SPECIFIC_INSTRUCTIONS]

---

## 4. Verification and Originality Contracts
- **Accuracy Contract:** Solve every single equation, ratio, and question independently before final output. Ensure all options are mutually exclusive, arithmetic is 100% correct, and units match throughout.
- **Originality Contract:** Write in original language from first principles. Do not copy questions from standard textbooks (R.S. Aggarwal, Arun Sharma) or websites (IndiaBIX, GeeksforGeeks). Use fresh real-world contexts and distinct numerical values.
```
