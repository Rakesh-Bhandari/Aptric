<USER_REQUEST>
# Aptric Public Aptitude Resource Hub — Master Implementation Prompt

> **Purpose:** Give this complete prompt to Claude Code, Codex, Cursor, or another coding agent with access to the Aptric repository. The agent must inspect the real codebase and deployed website first, then implement a polished public aptitude knowledge hub that complements the existing authenticated Aptric learning product.
>
> **Repository:** https://github.com/Rakesh-Bhandari/Aptric  
> **Deployed website:** https://aptric.vercel.app  
> **Primary outcome:** Original, genuinely useful, indexable aptitude learning resources available without authentication, plus a controlled 10-question solver trial that encourages visitors to create an account.

---

## 1. Role and operating rules

Act as a senior full-stack engineer, product designer, technical SEO specialist, accessibility reviewer, application-security engineer, test engineer, and educational-content architect.

### Non-negotiable rules

1. **Inspect before implementing.** Review the actual repository and deployed application. Do not start by generating components or editing files.
2. **Do not use Markdown documentation as the sole source of truth.** Documentation may explain intended architecture, but verify it against implementation, database migrations, routes, tests, environment configuration, and the running application.
3. Preserve the existing product, user data, authentication, daily challenge, practice engine, question-grading rules, progress tracking, leaderboards, and AI tutor for authenticated users.
4. Do not perform a broad rewrite, change frameworks, replace the database, or add a second parallel question-solving engine when the existing engine can be reused.
5. Never fabricate inspection results. If a route, deployment, credential, database, or external service cannot be accessed, document the limitation and continue with verified local evidence.
6. Make small, reviewable changes. Follow existing naming conventions, component patterns, API client conventions, database migration conventions, styling tokens, and test structure.
7. Do not expose secret keys, service-role credentials, private account data, answer keys, or authenticated APIs to anonymous clients.
8. All new public educational material must be original, checked for correctness, and edited for clarity. Do not copy articles from GeeksforGeeks, Stack Overflow, exam-preparation sites, textbooks, or other publishers. Those platforms are inspiration for organization and usefulness, not text to reproduce.
9. **AdSense approval is not guaranteed.** Build a high-quality, transparent site that can be evaluated against current Google publisher policies. Do not promise approval, fabricate traffic, add deceptive ads, or produce thin pages solely to increase indexed URLs.
10. Do not claim work is complete until tests, builds, route checks, and the final review have actually run. Report failed or unavailable checks explicitly.

---

## 2. Phase 0 — Mandatory repository and deployment audit

Before changing code, produce a short internal implementation map and a concise audit report.

### 2.1 Inspect repository structure and configuration

Inspect all relevant source files, not only `.md` files:

1. Root-level files, package manifests, lockfiles, workspace settings, `.gitignore`, Vercel configuration, and CI workflows.
2. `frontend/`: route definitions, landing page, layouts, navigation, theme tokens, typography, shared components, responsive styles, query/state management, API client, session/auth handling, loading states, error boundaries, and tests.
3. `backend/`: API entry point, middleware, routes, services, validation, rate limiting, authentication/authorization, public endpoints, database access, error handling, and tests.
4. `supabase/migrations/`: actual question-bank schema, topic/subtopic taxonomy, row-level security, SQL functions, policies, indexes, seed data, grants, and database tests.
5. `supabase/types/` and generated types. Regenerate only through the repository's established process if a schema change requires it.
6. Existing question-generation/review workflow and how a question transitions from draft to review to published.
7. Existing daily challenge and practice solve flow, including how the server selects questions, grades answers, reveals explanations, handles timers, and prevents answer-key leakage.
8. Existing SEO metadata, canonical tags, sitemap, robots rules, Open Graph tags, structured data, and static/prerendering behavior.
9. Existing legal/trust pages: About, Contact, Privacy Policy, Terms, cookie/consent controls if applicable, and any existing footer links.
10. Existing frontend, backend, end-to-end, accessibility, and database tests.

Use existing repository scripts to inspect dependencies and run checks. Never print `.env` values, access tokens, passwords, private keys, or database credentials. It is acceptable to inspect environment-variable *names* and example configuration.

### 2.2 Inspect the deployed website

1. Open the deployed home page and inspect its visual appearance at desktop and mobile widths.
2. Test the main navigation, theme toggle, signup/signin flow entry points, daily solve, practice solve, and existing landing-page calls to action.
3. Inspect what happens when a visitor is signed out and opens protected URLs directly.
4. Check browser console errors, failed network requests, missing assets, broken links, layout overflow, and loading/error states where browser tools are available.
5. Confirm whether the frontend is a client-rendered SPA, whether routes return useful HTML to crawlers, and how Vercel handles direct requests to nested routes.
6. Verify the canonical deployed domain and current redirect behavior. Do not assume `aptric.vercel.app` is necessarily the permanent canonical domain; inspect current configuration.
7. Compare the deployed behavior with the current repository. Record any mismatch rather than silently assuming they are identical.

### 2.3 Create a baseline report

Record:
- Current framework, router, styling system, and design tokens.
- Current public and authenticated routes.
- Existing reusable solve components and APIs.
- Existing topic taxonomy and published-question count, using aggregate counts only.
- Current anonymous access rules and RLS behavior.
- Existing metadata/rendering limitations.
- Test/build commands and baseline failures.
- Proposed files to change and any required migration.

Do not dump all questions or expose answer keys during inspection. Use counts and schema inspection where possible. If full live inspection is impossible, state exactly what could and could not be inspected.

---

## 3. Product goal and experience

Build an Aptric public knowledge hub with the organizational depth of a high-quality educational reference site. The analogy to GeeksforGeeks or Stack Overflow is **information architecture, navigability, and practical explanations**—not copying their content or imitating their branding.

The experience must have three connected layers:

1. **Public resource library:** freely accessible without login, with no access quota for reading notes, formulas, examples, tips, or topic indexes.
2. **10-question anonymous trial:** a short, polished demonstration of Aptric's existing question-solving experience.
3. **Authenticated Aptric:** existing daily/practice features and the existing AI tutor, progress, and account features remain behind their current access controls.

Primary business goal: help visitors learn something valuable, trust the quality of Aptric, and voluntarily sign up to continue personalized practice.

Do not make resource content artificially inaccessible to force registration. Do not place login walls on public notes.

---

## 4. Navigation, routes, and information architecture

Inspect the existing router before selecting final paths. Adapt these suggested routes to current conventions and avoid collisions.

### 4.1 Suggested public routes

1. `/resources` — resource hub landing/index.
2. `/resources/quantitative-aptitude` — section landing page.
3. `/resources/quantitative-aptitude/percentages` — individual topic page.
4. `/resources/quantitative-aptitude/percentages/percentage-change` — optional subtopic route, only if the content genuinely warrants a separate page.
5. Equivalent routes for Logical Reasoning, Verbal Ability, Data Interpretation, and Technical Aptitude.
6. `/free-trial` — anonymous trial introduction or solver entry.
7. `/free-trial/solve` — trial session, if a distinct route is needed.
8. Reuse existing legal and company-information routes; create missing essential trust pages only after checking the repository.

Use clean, stable, lowercase, hyphenated slugs. Every published topic page must have a unique URL, a clear title, a breadcrumb path, and meaningful links to its parent section, related topics, and relevant subtopics.

### 4.2 Landing page CTA

Add a prominent CTA in the existing landing-page hero, such as **“Explore Free Resources”** or **“Start Learning Free.”**

1. It must navigate to `/resources` (or the final agreed public hub route).
2. The CTA must match the current theme, component style, focus behavior, and responsive layout.
3. Keep the existing signup CTA; do not replace the primary product conversion path without evidence.
4. Add contextual links from relevant landing-page sections to the resource library.
5. Avoid fake urgency, misleading claims, fabricated user counts, or unsupported outcome promises.

### 4.3 Resource hub page

Create a clear, scannable resource index with:

1. A concise introduction explaining who the resources are for and what is covered.
2. Search by topic/subtopic title and relevant keywords. Search should not require login.
3. Section cards for all existing main aptitude sections.
4. For each section, show its purpose and a curated list of available topics.
5. A clear topic/subtopic hierarchy; do not dump every database question or every page's full text into the hub.
6. Optional “Recently updated” or “Popular” groupings only if they can be supported by real data and are not misleading.
7. A CTA to try the 10-question solver and a separate signup CTA.
8. Helpful empty, no-results, loading, and error states.

Use an authored, deterministic topic catalogue or an appropriately cached lightweight catalogue. Do not make a page load the entire question bank to render the topic index.

### 4.4 Topic and subtopic navigation

Each section/topic page must provide:

1. Breadcrumbs, e.g. Home → Resources → Quantitative Aptitude → Percentages.
2. A table of contents with links to page sections.
3. Links to all relevant subtopics.
4. **Previous topic** and **Next topic** navigation based on the canonical topic order, not database row order or nondeterministic sorting.
5. Clear handling of first/last topic, unavailable topics, and removed/retired content.
6. Related topics and a “Practice this topic” CTA.
7. A mobile-friendly navigation pattern. Tabs must be keyboard accessible; if the items are navigation links, use links styled as tabs rather than ARIA tab widgets with incorrect keyboard semantics.
8. No dead-end pages. Every resource page must have a route back to the section and hub.

---

## 5. Topic taxonomy and required coverage

First reconcile this catalogue with the real topic and subtopic records already in Aptric. Preserve valid existing slugs and identifiers when practical. Avoid creating duplicate taxonomies. Use the list below as the **coverage plan**, not permission to publish empty or thin pages. Prioritize complete, high-quality core pages over hundreds of shallow pages.

### 5.1 Quantitative Aptitude

1. **Number System**
   - Natural, whole, integer, rational, irrational, and real numbers
   - Prime and composite numbers
   - Divisibility rules
   - Factors and multiples
   - Remainders and modular patterns
   - Unit digit and cyclicity
   - Factorials and trailing zeroes
   - HCF/GCD and LCM
2. **Simplification and Approximation**
   - BODMAS/PEMDAS and order of operations
   - Fractions and decimals
   - Surds and indices
   - Approximation and estimation
3. **Percentages**
   - Percentage fundamentals and conversions
   - Finding a percentage of a quantity
   - Percentage increase and decrease
   - Successive percentage changes
   - Reverse percentages
   - Percentage-point change versus relative percentage change
4. **Ratio and Proportion**
   - Ratio simplification
   - Equivalent ratios and proportions
   - Direct and inverse proportion
   - Dividing a quantity in a given ratio
   - Partnership problems
5. **Averages**
   - Arithmetic mean
   - Weighted averages
   - Combined averages
   - Missing-value problems
   - Average speed versus average of speeds
6. **Profit, Loss, and Discount**
   - Cost price, selling price, marked price
   - Profit/loss percentage
   - Single and successive discounts
   - Markup and discount combinations
   - Dishonest weights and related problems
7. **Simple and Compound Interest**
   - Principal, rate, time, and simple interest
   - Compound interest
   - Annual, half-yearly, and quarterly compounding
   - Difference between SI and CI
   - Growth and depreciation
8. **Time and Work**
   - Work rates and efficiency
   - Combined work
   - Work and wages
   - Alternate-day work
   - Pipes and cisterns
9. **Time, Speed, and Distance**
   - Core speed-distance-time relationship
   - Relative speed
   - Trains and platforms
   - Boats and streams
   - Races and circular tracks
   - Average speed with equal/different distances
10. **Mixtures and Alligation**
    - Concentration and weighted mixture
    - Replacement and repeated dilution
    - Alligation rule and its derivation
11. **Problems on Ages**
    - Present, past, and future ages
    - Age ratios and sums
    - Forming and solving equations
12. **Algebra**
    - Linear equations
    - Simultaneous equations
    - Quadratic equations
    - Algebraic identities
    - Inequalities
    - Sequences and progressions
13. **Geometry**
    - Lines and angles
    - Triangles and similarity
    - Quadrilaterals and polygons
    - Circles
    - Coordinate geometry basics
14. **Mensuration**
    - Perimeter and area
    - Surface area and volume
    - Composite shapes
    - Unit conversion
15. **Permutation and Combination**
    - Fundamental counting principle
    - Factorials
    - Permutations with/without repetition
    - Combinations
    - Circular arrangements where appropriate
16. **Probability**
    - Sample spaces and events
    - Complementary events
    - Independent and dependent events
    - Conditional probability basics
17. **Logarithms and Exponents**
    - Exponent laws
    - Logarithm laws
    - Solving basic exponential/logarithmic equations
18. **Clocks and Calendars**
    - Clock angles and hand movement
    - Time gain/loss
    - Odd days and leap years
    - Calendar day calculations

### 5.2 Logical Reasoning

1. **Number Series**
   - Arithmetic and geometric patterns
   - Differences and second differences
   - Alternating patterns
   - Squares, cubes, primes, and mixed patterns
2. **Alphabet and Alphanumeric Series**
   - Letter positions
   - Alternating sequences
   - Number-letter combinations
3. **Analogy and Classification**
   - Word and number analogies
   - Relationship identification
   - Odd-one-out reasoning
4. **Coding-Decoding**
   - Letter shifts
   - Substitution codes
   - Position-based codes
   - Pattern and rule inference
5. **Blood Relations**
   - Family-tree representation
   - Coded relationships
   - Multi-generation problems
6. **Direction Sense and Distance**
   - Cardinal directions
   - Turns and orientation
   - Shortest distance
   - Coordinate-grid methods
7. **Ranking and Ordering**
   - Rank from left/right/top/bottom
   - Total number of people
   - Relative order and comparisons
8. **Syllogisms**
   - All/some/no statements
   - Venn-diagram reasoning
   - Valid versus invalid conclusions
9. **Statement and Conclusion**
   - Logical entailment
   - Assumptions
   - Arguments and inferences
10. **Seating Arrangements**
    - Linear arrangements
    - Circular arrangements
    - Facing inward/outward
    - Multiple attributes
11. **Logical Puzzles**
    - Ordering and scheduling
    - Floor and building puzzles
    - Assignment and distribution
    - Constraint tables
12. **Data Sufficiency**
    - Whether information is sufficient
    - Evaluating statements independently and together
13. **Clocks and Calendars**
    - Reasoning patterns involving time and dates
14. **Non-Verbal Reasoning**
    - Figure series
    - Figure analogy and classification
    - Mirror and water images
    - Paper folding/cutting
    - Embedded figures and spatial patterns

### 5.3 Verbal Ability

1. **Grammar Foundations**
   - Parts of speech
   - Subject-verb agreement
   - Tenses
   - Articles and determiners
   - Prepositions
   - Pronouns
   - Modifiers and parallel structure
2. **Sentence Correction**
   - Grammar errors
   - Word choice
   - Concision and clarity
   - Common agreement errors
3. **Error Spotting**
   - Tense and agreement
   - Articles and prepositions
   - Pronoun reference
   - Sentence structure
4. **Vocabulary**
   - Synonyms and antonyms
   - Contextual meaning
   - Commonly confused words
   - Word roots and affixes
5. **Idioms and Phrases**
   - Meaning in context
   - Correct usage
6. **One-Word Substitution**
   - Meaning-based vocabulary
   - Context and usage
7. **Fill in the Blanks and Cloze Tests**
   - Grammar cues
   - Context clues
   - Cohesion and tone
8. **Para Jumbles**
   - Opening and closing sentence clues
   - Pronoun references
   - Transition words
   - Cause-effect and chronological order
9. **Sentence Completion**
   - Meaning, tone, and logical consistency
10. **Active and Passive Voice**
    - Tense preservation
    - Agent and object
11. **Direct and Indirect Speech**
    - Reporting verbs
    - Tense/pronoun/time changes
12. **Reading Comprehension**
    - Main idea
    - Supporting details
    - Inference
    - Author tone and purpose
    - Vocabulary in context
    - Evidence-based answers

### 5.4 Data Interpretation

1. **Tables**
   - Reading row/column values
   - Totals, differences, ratios, and percentages
   - Multi-step table questions
2. **Bar Charts**
   - Simple and grouped bars
   - Comparisons and percentage change
3. **Line Graphs**
   - Trends over time
   - Absolute versus relative change
4. **Pie Charts**
   - Sector angle and percentage
   - Converting shares to quantities
5. **Mixed Graphs**
   - Combining tables, bars, lines, and pie charts
6. **Caselets**
   - Extracting structured data from prose
   - Building tables before calculating
7. **Data Comparison**
   - Comparing ratios, averages, and growth
8. **Approximation and Calculation Efficiency**
   - Estimation
   - Choosing calculation order
   - Avoiding rounding errors
9. **Data Sufficiency in DI**
   - Determining whether given information supports a unique answer

### 5.5 Technical Aptitude

1. **Programming Fundamentals**
   - Variables, types, operators, expressions
   - Conditions and loops
   - Functions and scope
   - Recursion basics
   - Tracing code and predicting output
2. **C Programming**
   - Data types, operators, control flow
   - Arrays and strings
   - Pointers at an introductory level
   - Functions and recursion
3. **C++ and Object-Oriented Programming**
   - Classes and objects
   - Encapsulation, inheritance, polymorphism, abstraction
   - Constructors and destructors
   - Overloading and overriding
4. **Python Fundamentals**
   - Core types and collections
   - Control flow and functions
   - Mutability and references
   - Basic output tracing
5. **Java Fundamentals**
   - Types and control flow
   - Classes and objects
   - Inheritance and interfaces
   - Exception basics
6. **Data Structures**
   - Arrays and linked lists
   - Stacks and queues
   - Hashing
   - Trees and binary search trees
   - Heaps and graphs at a basic level
7. **Algorithms and Complexity**
   - Linear and binary search
   - Sorting fundamentals
   - Time and space complexity
   - Big-O interpretation
8. **DBMS and SQL**
   - Keys and constraints
   - Normalization basics
   - Joins and aggregation
   - Transactions and ACID
   - Indexes and query reasoning
9. **Operating Systems**
   - Processes and threads
   - Scheduling basics
   - Deadlocks
   - Memory management
   - Virtual memory
10. **Computer Networks**
    - OSI and TCP/IP models
    - IP, TCP, UDP, DNS, HTTP/HTTPS
    - Routing and basic network troubleshooting
11. **Digital Logic and Computer Organization** (include if aligned with current Aptric question taxonomy)
    - Number representations
    - Boolean algebra
    - Logic gates and truth tables
    - Basic CPU/memory concepts

### 5.6 Taxonomy rules

1. Reconcile the list above with the real production taxonomy before creating anything.
2. Keep section/topic/subtopic names, IDs, and slugs consistent across routes, breadcrumbs, search, content metadata, and practice links.
3. If the current database has a canonical taxonomy, reuse it. Add a migration only when necessary and compatible with existing production data.
4. Do not seed hundreds of questions. The anonymous trial's initial pool must contain only **25–30 reviewed questions total**, distributed across representative topics and difficulties.
5. Keep the public resource library separate from the trial question pool. Notes must not depend on loading question-bank records.
6. Do not publish a separate page for every tiny variation if that would create thin or repetitive content. A subtopic can be a well-structured section on its parent page until it has enough distinct original material.

---

## 6. Required structure of every educational topic page

Each page must be a useful learning resource, not a short SEO placeholder.

1. **Title and learning objective:** explain exactly what the learner will be able to do.
2. **Short introduction:** define the concept in plain language and state when it is useful.
3. **Prerequisites:** link to relevant earlier topics when appropriate.
4. **Core concepts:** explain the underlying reasoning, not just memorized rules.
5. **Definitions and notation:** define variables and terms before using them.
6. **Formula/reference section:** present formulas, variable meanings, assumptions, and units. Do not list formulas without explaining their use.
7. **Step-by-step worked examples:** use original numbers and realistic contexts. Show the reasoning at each step and verify the final result.
8. **Alternative methods:** include a shortcut only when it is valid; explain when the shortcut does and does not work.
9. **Tips and tricks:** give actionable time-saving methods, pattern recognition, and estimation techniques.
10. **Common mistakes:** explain why each mistake happens and how to avoid it.
11. **Difficulty progression:** foundational example, standard example, and a more challenging example where appropriate.
12. **Practice checkpoint:** a small set of original questions, with answers/explanations either revealed appropriately or linked to the trial. Do not accidentally leak answers for protected scoring questions.
13. **Summary / quick revision:** compact recap of essential takeaways.
14. **FAQs:** answer real learner questions. Do not create empty, repetitive FAQs just for schema.
15. **Related topics:** contextual internal links to prerequisites, next steps, and related concepts.
16. **Previous/Next navigation:** deterministic, accessible navigation through the topic order.
17. **Last reviewed/updated information:** show a date only if the content is actually reviewed or updated. Do not fabricate authors, reviewers, dates, credentials, or citations.
18. **Feedback affordance:** let users report an error or suggest a correction without requiring an account if feasible; validate and rate-limit submissions. Do not publish user submissions automatically.
19. **Source/verification notes:** cite genuine sources when using factual claims that require sourcing. Original worked examples and explanations should be written independently.
20. **Call to action:** a subtle, relevant “Practice this topic” or “Try 10 questions free” link. The content must remain useful without clicking it.

For verbal and technical topics, adapt the page structure to the discipline. Do not force mathematical formulas onto grammar or programming pages.

---

## 7. Separate content-generation prompt for every subtopic

The implementation must include a reusable content-generation prompt template and a complete, numbered subtopic catalogue. For each subtopic in Section 5, the coding/content agent must generate an **individual prompt/brief** that names the exact subtopic and specifies its unique concepts, worked-example requirements, pitfalls, and learning outcomes.

### 7.1 Output requirement for content prompts

Create a maintainable prompt library in a suitable repository location, preferably under the existing `prompts/` structure, after checking current conventions. Suggested organization:

- `prompts/public-resources/MASTER_IMPLEMENTATION_PROMPT.md` — this specification or a linked implementation record.
- `prompts/public-resources/CONTENT_PROMPT_TEMPLATE.md` — the reusable content-generation contract.
- `prompts/public-resources/subtopics/` — one Markdown prompt file per distinct subtopic, grouped by section or with stable slug-based filenames.
- `prompts/public-resources/CONTENT_INDEX.md` — numbered index linking every prompt to its route/section/topic.

Do not generate empty prompt files or duplicate the same generic text without subtopic-specific instructions. If creating a separate file for every subtopic in one pass is too large, create them in bounded batches, track completion in the index, and do not mark incomplete topics as done.

### 7.2 Reusable individual content prompt

Use the following as the baseline for each generated subtopic prompt, then customize its subject-specific requirements:

> You are an experienced aptitude educator and educational editor. Create a complete, original, accurate learning resource for **[SECTION] → [TOPIC] → [SUBTOPIC]** for Aptric.
>
> **Audience:** students preparing for campus placements, general aptitude tests, and relevant competitive assessments. Assume the reader may be new to the concept.
>
> **Learning outcome:** [state observable skills specific to this subtopic].
>
> **Must include:** clear definition; prerequisite knowledge; step-by-step concept explanation; formulas and variable definitions where applicable; at least three independently checked worked examples of increasing difficulty where appropriate; a valid shortcut or efficient method with its conditions; common mistakes and corrections; a concise revision summary; five original practice questions with verified answers and explanatory solutions; 3–6 genuinely useful FAQs when warranted; and links/labels for related Aptric topics.
>
> **Accuracy contract:** solve every example independently before writing the explanation; verify arithmetic, units, signs, edge cases, answer choices, and uniqueness of the answer. For programming topics, manually trace the code and state language/version assumptions. For grammar, explain why the correct construction works and why likely alternatives fail. For logical reasoning, prove the inference rather than relying on intuition. Do not invent exam-specific claims or assert a question appeared in a past paper unless there is a reliable source.
>
> **Originality contract:** write from first principles in original wording. Never paraphrase a competitor article paragraph by paragraph, reproduce copyrighted question banks, or copy proprietary explanations. Use newly constructed examples and scenarios. Cite external sources for claims that require support.
>
> **Quality bar:** teach the reasoning, not merely the answer. Define every symbol, avoid unexplained jargon, use readable headings and lists, and use MathJax/KaTeX-compatible notation consistent with the current application. Ensure the material stands on its own without login or an AI tutor.
>
> **Output:** provide (1) title, (2) slug suggestion, (3) meta title, (4) meta description, (5) learning outcomes, (6) prerequisite/related links by canonical slug, (7) the full article in the site's supported content format, (8) five practice questions with answer/explanation, (9) a correctness checklist, and (10) a short editorial review note identifying assumptions or claims that need verification.
>
> Do not output filler, keyword-stuffed prose, generic introductions, fabricated references, fake author biographies, fake review dates, or unsupported promises. If the topic is too broad, recommend a sensible split rather than creating a shallow article.

### 7.3 Subject-specific content instructions

For every listed subtopic, the individual prompt must additionally require the relevant material below.

1. **Arithmetic and number theory:** show derivations, use small verifiable numbers first, state divisibility/remainder conditions, and explain when a shortcut fails.
2. **Percentages, ratios, averages, interest, profit/loss:** distinguish base values from percentage changes, show units, explain successive changes carefully, and verify results by substitution or an independent method.
3. **Time/work and speed/distance:** define rates and units, use consistent time units, distinguish average speed from average of speeds, and check relative direction assumptions.
4. **Geometry and mensuration:** define diagrams in words or provide accessible labelled diagrams if the app supports them, state theorem conditions, and verify dimensions and units.
5. **Counting and probability:** define the sample space, distinguish permutations from combinations, state independence assumptions, and verify probabilities fall within [0, 1].
6. **Series, coding, analogy, and classification:** explain the inferred rule, test it against all given terms, and avoid questions with multiple plausible rules unless ambiguity is the learning objective.
7. **Blood relations, directions, ranking, seating, and puzzles:** establish a consistent diagram/table, define orientation, show constraints step by step, and demonstrate that the final arrangement satisfies every clue.
8. **Syllogisms and statement-based reasoning:** distinguish what follows logically from what is merely plausible; do not use unstated real-world assumptions.
9. **Grammar and sentence correction:** state the relevant rule, show the sentence context, explain the correction, and avoid treating style preferences as absolute grammar laws.
10. **Vocabulary and idioms:** give contextual examples and usage notes; do not claim that near-synonyms are always interchangeable.
11. **Reading comprehension and para jumbles:** teach evidence-based inference and cohesion clues; avoid pretending that subjective interpretations are uniquely correct without textual support.
12. **Data interpretation:** include a small original dataset or clear textual data table, explain units and rounding, and check that every answer can be derived from the supplied data.
13. **Programming and code tracing:** include short original code snippets, specify the language and version assumptions, trace state changes, explain output, and avoid undefined or implementation-dependent behavior unless explicitly teaching it.
14. **Data structures and algorithms:** explain operations and invariants, give time/space complexity with assumptions, and do not present Big-O as an exact runtime.
15. **DBMS/SQL, operating systems, networks, and digital logic:** distinguish conceptual models from implementation-specific behavior; validate examples and clearly state scope and assumptions.

---

## 8. Anonymous 10-question trial — reuse the real solver

The trial must demonstrate the actual Aptric solving experience, not a visually similar but disconnected mockup.

### 8.1 Trial experience

1. Add a clear “Try 10 Questions Free” CTA from the landing page and resource pages.
2. The trial page must reuse existing solve-screen components, question rendering, keyboard controls, timer behavior where suitable, explanation styling, progress indicator, answer feedback, and responsive layout.
3. Reuse the existing solve engine and safe question-selection/grading patterns wherever possible. Introduce a separate trial mode/session identifier rather than copying the full solve implementation.
4. Select exactly **10 questions per trial session**, from a reviewed pool of **25–30 questions total**. The 25–30 is the initial approved pool size, not a requirement to send all questions to the browser.
5. Distribute the pool across multiple topics and suitable difficulty levels. Use only original or properly licensed content, checked by a human/editorial review process.
6. Keep the trial coherent: show progress such as “Question 3 of 10,” clear answer state, next/back behavior consistent with existing product rules, and a useful completion summary.
7. After the tenth question, show the result and a signup CTA. Explain the benefit honestly: create an account to continue with daily challenges, personalized practice, saved progress, and other existing account features.
8. A visitor may read any number of resource pages before, during, or after the trial. Resource access must never be blocked by the trial limit.
9. **No anonymous AI tutor, AI hints, or AI-generated per-user explanations.** Public notes and stored, reviewed explanations remain available. Keep the existing AI tutor available under its current authenticated rules.
10. Do not force registration before the visitor has been able to try the 10 questions. A short optional signup invitation may appear, but must not interrupt solving.

### 8.2 Trial session and abuse boundaries

1. Determine the appropriate session mechanism after reviewing existing backend conventions. Prefer a server-issued, short-lived, signed/opaque trial session identifier with minimal stored state, or another robust design consistent with the deployed platform.
2. Do not trust a client-provided counter, question IDs, score, correctness, or “completed” flag as authoritative.
3. Do not send the entire 25–30-question bank or answer keys to the client. Fetch only the currently permitted question payload and only reveal explanations/answers at the intended point in the flow.
4. Do not rely on `localStorage` alone for enforcing the trial limit. It may be used for non-sensitive UI continuity, not as the authoritative security boundary.
5. Define the product policy for restarting a trial explicitly. Prevent trivial endpoint abuse with appropriate rate limits and session validation, while recognizing that anonymous limits cannot perfectly identify a person without intrusive fingerprinting. Do not use invasive fingerprinting.
6. A visitor must not be able to bypass the intended 10-question session simply by changing a request body, URL, question index, or client state.
7. Avoid collecting unnecessary personal information from anonymous visitors.
8. Add no new external service unless necessary and approved. Avoid introducing Redis or another database just for the trial if the current stack can safely support it.

### 8.3 Database and query efficiency

1. Never load all questions into the browser or query and return the entire question bank for the trial.
2. Select from the small published trial pool on the server, using indexed queries and bounded results.
3. Inspect current RLS and `SECURITY DEFINER` functions before making changes. Use least-privilege grants and validate anonymous access at the database/API boundary.
4. Keep private question-bank fields, answer keys, moderation fields, internal review notes, and user-specific records inaccessible to anonymous callers.
5. Use a migration for any schema change; make it reversible where the project's migration practices support that, and include database tests.
6. Do not alter existing daily-set generation, cron jobs, or user scoring semantics as a side effect.
7. If the current architecture cannot safely support anonymous trial sessions without changing core functions, explain the trade-off and implement the smallest safe addition.

---

## 9. Public-access and authentication boundary

### Public without login

1. Resource hub, section pages, topic pages, subtopic pages, formulas, worked examples, tips, summaries, and public FAQs.
2. Topic search and navigation.
3. The trial introduction and exactly 10-question trial session.
4. Public About, Contact, Privacy Policy, Terms, and other trust pages where applicable.

### Authentication remains required where it is required today

1. Daily personalized challenge and saved progress.
2. User profile, history, streaks, levels, ratings, leagues, and personalized analytics.
3. Existing account management and private endpoints.
4. AI tutor and authenticated AI features.
5. Admin editing, moderation, publishing, question-bank administration, and other privileged operations.

### Security requirements

1. Verify authorization on the backend, not only in React route guards.
2. Public API responses must use explicit response schemas/allowlists; never serialize full database rows by default.
3. Validate all route parameters and request bodies; cap page sizes and response sizes.
4. Apply appropriate rate limits to public search, trial creation, trial answer submission, and feedback endpoints.
5. Use safe error messages that do not leak SQL, stack traces, secrets, private data, or answer keys.
6. Do not expose Supabase secret/service-role credentials or any privileged key in frontend code, `VITE_*` variables, rendered HTML, logs, or public API responses.
7. Check CORS, cache headers, session expiry, replay behavior, idempotency, and error handling.
8. Verify RLS policies for anonymous reads. Grant access only to explicitly public published resource records or the minimal trial operations. Never make the question bank broadly readable just to make a public page work.
9. Ensure public cache behavior cannot leak personalized responses between users. Do not cache authenticated responses as shared public content.
10. Avoid storing IP addresses or device fingerprints for the trial unless there is a documented, necessary, privacy-reviewed reason.

---

## 10. Originality, editorial review, and content quality

The website must be genuinely useful for learners.

1. Write original explanations, examples, practice questions, and illustrations.
2. Do not scrape competitor sites, copy question banks, or lightly rewrite third-party articles.
3. Avoid publishing near-duplicate pages for tiny keyword variations.
4. A topic should only be marked published when its explanation, worked examples, answer keys, internal links, and metadata have passed validation.
5. Use an editorial status such as draft/review/published if it fits the current content model. Do not create a second admin system unnecessarily.
6. Content generated with AI must be checked by a competent reviewer. AI-generated text is not automatically accurate or original.
7. Where relevant, explain assumptions and show derivations so a learner can verify the answer.
8. Avoid unsupported statements such as “guaranteed placement,” “100% asked in exams,” or fabricated exam-specific weightage.
9. Do not invent author credentials, endorsements, user testimonials, traffic statistics, or update dates.
10. If a page is incomplete, do not present it as a fully reviewed resource. Keep it in draft/unpublished state or omit it from public indexes and sitemaps.
11. Provide a practical way to report a suspected wrong answer or broken explanation.
12. Do not add comments/forums or user-generated content unless separately designed with moderation, privacy, and abuse controls.

---

## 11. SEO and discoverability

Implement technical SEO correctly, without guaranteeing rankings or AdSense acceptance.

### 11.1 Indexable rendering

1. Inspect how the current SPA renders public pages and how crawlers receive content.
2. Ensure every published resource route returns meaningful, crawlable page content and unique metadata. If current client-side rendering is insufficient, evaluate the least disruptive supported option: prerendering, static generation, or the framework-compatible rendering approach already used by the project.
3. Do not migrate the entire app to another framework without a strong, documented reason.
4. Confirm direct navigation and refresh work for every nested public route on Vercel.
5. Avoid returning the same generic HTML title/description for every resource URL.

### 11.2 Per-page metadata

For each indexable page, provide:
1. Unique descriptive title.
2. Unique meta description written for humans.
3. Canonical URL on the verified canonical domain.
4. Correct robots directives.
5. Open Graph and social preview metadata.
6. Descriptive H1 and logical heading hierarchy.
7. Breadcrumb navigation visible to users.
8. A meaningful, stable URL slug.

### 11.3 Sitemap and robots

1. Add only canonical, indexable, published resource URLs to the sitemap.
2. Exclude trial session states, account pages, admin pages, private APIs, query-string duplicates, unpublished drafts, and error pages.
3. Use accurate `lastmod` dates only when real content updates occur.
4. Ensure `robots.txt` does not accidentally block CSS/JS or public resources and does not expose sensitive paths unnecessarily.
5. Verify sitemap XML syntax and HTTP status.
6. Submit the sitemap through Google Search Console after deployment; do not claim submission has occurred unless it has.

### 11.4 Structured data

Use only supported schema types that accurately describe visible content, such as `BreadcrumbList` and appropriate `Article`/`LearningResource` metadata where suitable. Validate generated JSON-LD. Do not fabricate reviews, ratings, authors, courses, FAQs, or results to obtain rich snippets. Structured data does not guarantee enhanced search results.

### 11.5 Internal links and content discovery

1. Link section → topic → subtopic and back.
2. Link prerequisites and related concepts contextually.
3. Provide previous/next navigation and a resource index.
4. Avoid orphaned pages.
5. Ensure every indexable page can be reached through ordinary HTML links, not only client-side search.
6. Add “Practice this topic” links that lead to the trial or authenticated practice flow appropriately.

---

## 12. AdSense readiness and trust

The objective is to make the website worthy of review, not to game a policy system.

1. Provide clear About, Contact, Privacy Policy, and Terms pages or verify existing equivalents.
2. Clearly identify Aptric and provide a legitimate contact route. Do not invent a physical address, business registration, or legal identity.
3. Explain what the product offers, what data it collects, and how accounts work.
4. Ensure all publicly advertised functionality actually works.
5. Publish substantial original content with accurate explanations and useful navigation.
6. Remove placeholder text, broken routes, dead buttons, empty topic pages, generic AI filler, and misleading claims before applying.
7. Ensure the site has no deceptive navigation, accidental clicks, forced ad interactions, or ads disguised as content.
8. If advertising is added later, keep ads visually distinguishable from content and avoid intrusive placements that obstruct reading, math, or question controls.
9. Do not add ad code or a consent banner unless the relevant setup and jurisdictional requirements have been considered. Follow current Google requirements and applicable privacy law.
10. Create or verify an accurate privacy policy describing advertising/cookie practices if advertising is enabled.
11. Do not claim that a certain number of pages, words, traffic level, or days online guarantees approval. Google makes the final decision under its current policies.

---

## 13. UI, UX, accessibility, and performance

Follow the current Aptric design system. The repository describes a deep navy `#0A2540`, action blue `#2563EB`, violet `#7C3AED`, light blue `#38BDF8`, and Plus Jakarta Sans, with dark/light themes. **Verify these tokens in the actual code before using them**; existing implementation wins over documentation if they differ.

1. Match the existing theme, light/dark/device preference, button styles, spacing, borders, shadows, and motion.
2. Keep the interface minimal, credible, and content-first. Avoid excessive gradients, cards inside cards, animations, and marketing clutter.
3. Design for mobile first, then tablet and desktop.
4. Use readable line length, line spacing, clear heading hierarchy, accessible math rendering, and sufficient contrast.
5. Use semantic HTML. Buttons perform actions; links navigate.
6. Keyboard users must be able to navigate all menus, search results, topic navigation, and the solver.
7. Provide visible focus states, descriptive labels, meaningful error messages, and correct ARIA only where needed.
8. Respect reduced-motion preferences and the current theme setting.
9. Prevent horizontal overflow from equations, code snippets, tables, or long URLs.
10. Ensure all buttons have working behavior; do not add inert placeholders.
11. Add skeleton/loading states only where they improve perceived performance. Avoid layout shifts.
12. Use lazy loading for below-the-fold decorative images and keep critical content fast.
13. Avoid large dependencies for simple UI features. Reuse installed packages and existing components.
14. Make the trial solver feel like the authenticated solver, but clearly label the trial state and remaining question count.
15. The signup prompt after question 10 must be clear, helpful, and non-coercive.

---

## 14. Suggested technical implementation approach

Adapt this plan to the code actually found in Phase 0.

1. Add public resource routes using the current router and shared layout.
2. Build a canonical resource catalogue from existing taxonomy data or a small typed manifest. Do not create competing sources of truth.
3. Build reusable components for resource index, breadcrumbs, table of contents, article content, formulas/examples, related links, and previous/next navigation.
4. Use the current Markdown/KaTeX rendering utilities if they are safe and suitable. Sanitize untrusted content and avoid unsafe HTML injection.
5. Decide whether article content is stored as reviewed local content files, typed content data, or database records based on the repository's current conventions and deployment requirements. Prefer a maintainable approach that does not require a database round trip for every static note unless dynamic publishing is necessary.
6. If content is database-backed, add explicit public-published-only reads and enforce them in RLS/API access.
7. Add the trial as a separate mode/session on the existing solver, sharing UI and safe logic without affecting signed-in gameplay.
8. Create the 25–30-question reviewed trial pool with unique IDs, topic/difficulty tags, correct answer, worked explanation, provenance/review status, and any fields required by the current schema. Never place the whole bank in a public static bundle.
9. Add backend endpoints only where needed; validate requests, authorize each operation, return minimal data, and add rate limits.
10. Add migrations and database tests only if needed. Never edit already-applied migrations in place; add a new migration following project conventions.
11. Update sitemap generation and metadata handling for public routes.
12. Add tests before considering the implementation complete.
13. Update relevant documentation only after code and tests reflect the actual implementation.

---

## 15. Testing and acceptance criteria

All checks must be run where possible and their actual results reported. Do not report “passed” based only on code inspection.

### 15.1 Resource access

1. Signed-out visitor can open `/resources` and every published resource page directly.
2. Refreshing a nested resource URL works in the production deployment.
3. Resource pages are readable without a token, cookie-based login, or account creation.
4. Reading resource pages has no trial-count side effect or artificial page limit.
5. Topic search, breadcrumbs, related links, previous/next links, and section navigation all work.
6. Unpublished and unknown slugs do not leak drafts or produce misleading content.
7. Every published page has unique title, description, canonical URL, and H1.
8. Sitemap contains published canonical pages only.

### 15.2 Trial flow

1. Signed-out visitor can start a trial without registering.
2. Exactly 10 questions are included in one trial session.
3. The source pool contains 25–30 approved questions initially.
4. The browser never receives all pool questions or all answer keys in advance.
5. The question UI uses the actual existing solve components and behaves consistently.
6. After question 10, the result and signup CTA are shown.
7. The visitor can continue reading unlimited public resources after finishing the trial.
8. Anonymous users cannot access the AI tutor or anonymous AI hints.
9. Signed-in daily/practice solving and AI tutor continue to work as before.
10. Tampering with client state, request bodies, question IDs, session IDs, or counters cannot grant extra scoring attempts or reveal protected answers.
11. Rate limits and expiry behavior work as intended.
12. Trial creation and answer submission handle retries safely.

### 15.3 Security and database

1. Anonymous callers cannot read private profiles, user progress, unpublished content, moderation fields, or unrestricted question-bank data.
2. Backend authorization is enforced even if frontend route guards are bypassed.
3. Secret keys are absent from built frontend assets and public responses.
4. Public API response schemas contain only intended fields.
5. RLS and database function privileges are verified with tests.
6. No shared cache leaks authenticated content.
7. Feedback/search/trial endpoints validate input and handle errors safely.
8. No production data is overwritten or deleted by a seed or migration.

### 15.4 Quality and compatibility

1. Run frontend lint, typecheck, unit tests, build, and E2E tests as supported by the project.
2. Run backend tests.
3. Run Supabase database tests when the local/database environment is available.
4. Test desktop and mobile widths, including narrow 320–360 px screens.
5. Test keyboard-only navigation, visible focus, screen-reader labels, contrast, reduced motion, and equation/code overflow.
6. Check console errors, failed requests, missing assets, and broken internal links.
7. Validate structured data, sitemap XML, canonical tags, and metadata.
8. Check performance and layout stability on representative public pages.
9. Re-test existing signup/signin, daily challenge, practice, progress, and authenticated tutor flows for regressions.
10. Do not silently suppress or loosen existing tests merely to make the new feature pass.

### 15.5 Completion report

At the end, provide:
- What was implemented.
- Exact files added/modified.
- Database migrations and deployment steps, if any.
- List of generated subtopic prompts and any still outstanding.
- Test commands and actual pass/fail results.
- Any checks that could not be run and why.
- Any known issues or trade-offs.
- Manual verification steps for the deployed site.
- A separate checklist for Google Search Console and eventual AdSense application.

---

## 16. Implementation order

Work in the following sequence; do not skip the inspection phase.

1. **Audit:** inspect code, schema, tests, routes, and deployed behavior; record baseline.
2. **Plan:** identify minimal files/components/routes and any schema changes. Confirm compatibility with existing auth and solve flows.
3. **Taxonomy:** reconcile canonical sections, topics, subtopics, slugs, and page order.
4. **Content system:** establish content format, template, validation, and editorial status.
5. **Prompt library:** create the reusable template and individual subtopic prompts; keep a complete numbered index.
6. **Public resource UI:** build hub, section/topic pages, breadcrumbs, TOC, related links, and previous/next navigation.
7. **Trial backend:** implement the minimal secure session and bounded question selection.
8. **Trial UI:** reuse the actual solve screen; add 10-question completion and signup flow; keep anonymous AI tutor disabled.
9. **SEO and trust:** metadata, rendering/indexability, sitemap, robots, legal/trust pages.
10. **Quality:** responsive/accessibility review, security checks, tests, builds, and regressions.
11. **Deploy verification:** verify actual deployed routes, content, redirects, API behavior, and metadata after deployment.
12. **Final report:** list completed work and remaining actions without exaggerating readiness.

---

## 17. Final instruction to the coding agent

Begin by inspecting the actual repository and the deployed website. **Do not start implementing until you have mapped the current routes, solver components, question schema, public/authenticated access rules, and rendering/SEO behavior.**

Then implement the smallest maintainable solution that meets this specification. Preserve all working Aptric features. Make public notes useful enough that a visitor can learn the concept without signing up, while making the trial a fair demonstration of the existing product.

Prioritize correctness, originality, privacy, security, crawlability, accessibility, and a polished user experience over the number of pages created. Do not create thin pages merely to inflate the sitemap. Do not load the full question bank. Do not provide an anonymous AI tutor. Do not promise AdSense approval.

If an instruction conflicts with the current architecture or would introduce a security flaw, explain the conflict and implement the safest compatible alternative rather than blindly following it.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-20T11:48:56+05:30.
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from None to Claude Opus 4.6 (Thinking). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>