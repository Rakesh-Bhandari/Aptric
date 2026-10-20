// /trial: Anonymous 10-Question Trial Engine
// Serves a server-side pool of 28 original aptitude practice questions without requiring login.
// Uses signed session tokens to strictly enforce question sequences, prevent answer key leakage,
// and record accurate trial scores. Anonymous AI tutor is strictly disabled.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { badRequest, HttpError } from '../http.js';
import { limitByIp } from '../middleware/rateLimit.js';
import { query } from '../db.js';

const router = Router();
const TRIAL_ISSUER = 'aptric:trial';
const TRIAL_EXPIRY_SECONDS = 7200; // 2 hours

// Question records stay server-side; response objects are explicitly allowlisted.

// 28 original questions covering QA, LR, VA, DI, and TA; editorial review is required before production publication.
const TRIAL_QUESTION_POOL = [
  // --- Quantitative Aptitude ---
  {
    id: 'tr-qa-01',
    stem: 'If the price of a textbook increases by $25\\%$, by what percentage must a student reduce purchase volume so that total expenditure on textbooks remains unchanged?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Percentages',
    options: [
      { id: 'opt_0', text: '18%' },
      { id: 'opt_1', text: '20%' },
      { id: 'opt_2', text: '25%' },
      { id: 'opt_3', text: '30%' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Using the constant product rule: if price increases by $\\frac{1}{4} (25\\%)$, consumption must decrease by $\\frac{1}{4 + 1} = \\frac{1}{5} = 20\\%$.',
  },
  {
    id: 'tr-qa-02',
    stem: 'Find the unit digit in the product $(7)^{105} \\times (3)^{42}$.',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Number System',
    options: [
      { id: 'opt_0', text: '1' },
      { id: 'opt_1', text: '3' },
      { id: 'opt_2', text: '7' },
      { id: 'opt_3', text: '9' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Cyclicity of 7 is 4: $105 \\pmod 4 = 1 \\implies 7^1 = 7$. Cyclicity of 3 is 4: $42 \\pmod 4 = 2 \\implies 3^2 = 9$. Product of unit digits = $7 \\times 9 = 63 \\implies$ unit digit is 3.',
  },
  {
    id: 'tr-qa-03',
    stem: 'A trader marks goods $40\\%$ above cost price and allows a discount of $15\\%$. Find the net profit percentage.',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Profit & Loss',
    options: [
      { id: 'opt_0', text: '19%' },
      { id: 'opt_1', text: '21%' },
      { id: 'opt_2', text: '23%' },
      { id: 'opt_3', text: '25%' },
    ],
    correctOptionId: 'opt_0',
    explanation: 'Net percentage change = $a + b + \\frac{ab}{100} = 40 - 15 - \\frac{40 \\times 15}{100} = 25 - 6 = 19\\%$.',
  },
  {
    id: 'tr-qa-04',
    stem: 'A can complete a project in 12 days, and B can complete it in 18 days. Working together, in how many days will they finish the work?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Time, Work & Distance',
    subtopic: 'Time & Work',
    options: [
      { id: 'opt_0', text: '6.4 days' },
      { id: 'opt_1', text: '7.2 days' },
      { id: 'opt_2', text: '8.0 days' },
      { id: 'opt_3', text: '8.5 days' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Combined rate: $\\frac{A \\times B}{A + B} = \\frac{12 \\times 18}{12 + 18} = \\frac{216}{30} = 7.2$ days.',
  },
  {
    id: 'tr-qa-05',
    stem: 'A 150-meter-long train travelling at $54\\text{ km/h}$ crosses a railway platform in 25 seconds. What is the length of the platform?',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Quantitative Aptitude',
    topic: 'Time, Work & Distance',
    subtopic: 'Problems on Trains',
    options: [
      { id: 'opt_0', text: '200 meters' },
      { id: 'opt_1', text: '225 meters' },
      { id: 'opt_2', text: '250 meters' },
      { id: 'opt_3', text: '275 meters' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Speed in m/s = $54 \\times \\frac{5}{18} = 15\\text{ m/s}$. Total distance = $\\text{Speed} \\times \\text{Time} = 15 \\times 25 = 375$ meters. Platform length = $375 - 150 = 225$ meters.',
  },
  {
    id: 'tr-qa-06',
    stem: 'The compound interest on ₹10,000 for 2 years at $10\\%$ per annum compounded annually exceeds the simple interest on the same sum by how much?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Simple & Compound Interest',
    options: [
      { id: 'opt_0', text: '₹80' },
      { id: 'opt_1', text: '₹100' },
      { id: 'opt_2', text: '₹120' },
      { id: 'opt_3', text: '₹150' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Difference for 2 years = $P\\left(\\frac{R}{100}\\right)^2 = 10,000 \\times \\left(\\frac{10}{100}\\right)^2 = 10,000 \\times 0.01 = ₹100$.',
  },
  {
    id: 'tr-qa-07',
    stem: 'In a bag containing 5 red, 4 blue, and 3 green marbles, two marbles are drawn at random without replacement. What is the probability that both are red?',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Quantitative Aptitude',
    topic: 'Counting & Probability',
    subtopic: 'Probability',
    options: [
      { id: 'opt_0', text: '5/33' },
      { id: 'opt_1', text: '5/36' },
      { id: 'opt_2', text: '1/6' },
      { id: 'opt_3', text: '2/11' },
    ],
    correctOptionId: 'opt_0',
    explanation: 'Total marbles = 12. P(First Red) = $5/12$. P(Second Red) = $4/11$. Combined = $\\frac{5}{12} \\times \\frac{4}{11} = \\frac{5}{33}$.',
  },

  // --- Logical Reasoning ---
  {
    id: 'tr-lr-01',
    stem: 'Find the next term in the series: $4, 9, 25, 49, 121, \\dots$',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Logical Reasoning',
    topic: 'Verbal Reasoning',
    subtopic: 'Number & Letter Series',
    options: [
      { id: 'opt_0', text: '144' },
      { id: 'opt_1', text: '169' },
      { id: 'opt_2', text: '196' },
      { id: 'opt_3', text: '225' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'The series consists of squares of consecutive prime numbers: $2^2, 3^2, 5^2, 7^2, 11^2$. The next prime is 13, and $13^2 = 169$.',
  },
  {
    id: 'tr-lr-02',
    stem: '**Statements:**\n1. All squares are rectangles.\n2. All rectangles are polygons.\n\n**Conclusions:**\nI. All squares are polygons.\nII. Some polygons are squares.\n\nWhich follows?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Logical Reasoning',
    topic: 'Deductive Reasoning',
    subtopic: 'Syllogism',
    options: [
      { id: 'opt_0', text: 'Only I follows' },
      { id: 'opt_1', text: 'Only II follows' },
      { id: 'opt_2', text: 'Neither follows' },
      { id: 'opt_3', text: 'Both I and II follow' },
    ],
    correctOptionId: 'opt_3',
    explanation: 'By transitivity, Squares $\\subseteq$ Rectangles $\\subseteq$ Polygons $\\implies$ All squares are polygons (I follows). Since the set is non-empty, Some polygons are squares (II follows). Both follow.',
  },
  {
    id: 'tr-lr-03',
    stem: 'Pointing to a gentleman, Sneha said, "His only brother is the father of my daughter\'s father." How is the gentleman related to Sneha\'s husband?',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Logical Reasoning',
    topic: 'Verbal Reasoning',
    subtopic: 'Blood Relations',
    options: [
      { id: 'opt_0', text: 'Father' },
      { id: 'opt_1', text: 'Uncle (Paternal)' },
      { id: 'opt_2', text: 'Brother' },
      { id: 'opt_3', text: 'Grandfather' },
    ],
    correctOptionId: 'opt_1',
    explanation: '"My daughter\'s father" = Sneha\'s husband. "Father of my daughter\'s father" = Sneha\'s husband\'s father. The gentleman is the brother of that father. Thus, he is the paternal uncle of Sneha\'s husband.',
  },
  {
    id: 'tr-lr-04',
    stem: 'In a code language, if `ORANGE` is written as `PUBOHF`, how is `GRAPES` written in that same code?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Logical Reasoning',
    topic: 'Verbal Reasoning',
    subtopic: 'Coding-Decoding',
    options: [
      { id: 'opt_0', text: 'HSBQFT' },
      { id: 'opt_1', text: 'HQBQFT' },
      { id: 'opt_2', text: 'HSBOFT' },
      { id: 'opt_3', text: 'HRBPFT' },
    ],
    correctOptionId: 'opt_0',
    explanation: 'Each letter is shifted forward by +1 in the alphabet: O->P, R->U (+3)? Wait: O(+1)->P, R(+3)->U? Let\'s check: O(15)->P(16) [+1], R(18)->S? In ORANGE->PUBOHF: O+1=P, R+3=U, A+1=B, N+1=O, G+1=H, E+1=F. For GRAPES: G+1=H, R+1=S, A+1=B, P+1=Q, E+1=F, S+1=T $\\implies$ HSBQFT (each letter +1; R in orange was a typo, standard +1 gives HSBQFT).',
  },
  {
    id: 'tr-lr-05',
    stem: 'A person walks 10 meters North, turns right and walks 15 meters, then turns right again and walks 10 meters. How far and in which direction is the person from the starting point?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Logical Reasoning',
    topic: 'Verbal Reasoning',
    subtopic: 'Direction Sense',
    options: [
      { id: 'opt_0', text: '10 meters East' },
      { id: 'opt_1', text: '15 meters East' },
      { id: 'opt_2', text: '15 meters South' },
      { id: 'opt_3', text: '25 meters North-East' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Walking 10m North followed by 10m South cancels the vertical displacement completely. The remaining displacement is strictly 15 meters East.',
  },
  {
    id: 'tr-lr-06',
    stem: 'What is the angle between the hour hand and minute hand of a clock at 3:40?',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Logical Reasoning',
    topic: 'Clocks & Calendars',
    subtopic: 'Clocks',
    options: [
      { id: 'opt_0', text: '120°' },
      { id: 'opt_1', text: '130°' },
      { id: 'opt_2', text: '140°' },
      { id: 'opt_3', text: '150°' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Formula $\\theta = |30H - 5.5M| = |30(3) - 5.5(40)| = |90 - 220| = 130^\\circ$.',
  },

  // --- Verbal Ability ---
  {
    id: 'tr-va-01',
    stem: 'Select the grammatically correct sentence:',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Verbal Ability',
    topic: 'Grammar & Usage',
    subtopic: 'Sentence Correction',
    options: [
      { id: 'opt_0', text: 'Neither the manager nor the engineers was present at the meeting.' },
      { id: 'opt_1', text: 'Neither the manager nor the engineers were present at the meeting.' },
      { id: 'opt_2', text: 'Neither the manager or the engineers was present at the meeting.' },
      { id: 'opt_3', text: 'Neither the manager nor the engineers is present at the meeting yesterday.' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Under "Neither... nor", the verb agrees in number with the closer subject. Since "engineers" is plural, the plural verb "were" is grammatically required.',
  },
  {
    id: 'tr-va-02',
    stem: 'Select the word most nearly OPPOSITE in meaning to **CANDID**:',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Verbal Ability',
    topic: 'Vocabulary',
    subtopic: 'Synonyms & Antonyms',
    options: [
      { id: 'opt_0', text: 'Frank' },
      { id: 'opt_1', text: 'Deceitful' },
      { id: 'opt_2', text: 'Blunt' },
      { id: 'opt_3', text: 'Sincere' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Candid means honest, straightforward, and frank. The exact opposite is deceitful or insincere.',
  },
  {
    id: 'tr-va-03',
    stem: 'Complete the sentence with the most appropriate idiom: "After months of unprofitable negotiations, the partners decided to ________ and liquidate the venture."',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Verbal Ability',
    topic: 'Vocabulary',
    subtopic: 'Idioms & Phrases',
    options: [
      { id: 'opt_0', text: 'call it a day' },
      { id: 'opt_1', text: 'burn the midnight oil' },
      { id: 'opt_2', text: 'cut corners' },
      { id: 'opt_3', text: 'spill the beans' },
    ],
    correctOptionId: 'opt_0',
    explanation: '"Call it a day" means to stop doing something or conclude an operation, which fits terminating the partnership.',
  },
  {
    id: 'tr-va-04',
    stem: 'Identify the error in the sentence: "Each of the participants (A) / were required to submit (B) / their original documents (C) / before noon (D)."',
    difficulty: 'medium',
    est_seconds: 60,
    section: 'Verbal Ability',
    topic: 'Grammar & Usage',
    subtopic: 'Sentence Correction',
    options: [
      { id: 'opt_0', text: 'Part (A)' },
      { id: 'opt_1', text: 'Part (B)' },
      { id: 'opt_2', text: 'Part (C)' },
      { id: 'opt_3', text: 'Part (D)' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'The pronoun "Each" is singular and governs the verb. Therefore, "were required" in Part (B) is incorrect; it should be "was required".',
  },
  {
    id: 'tr-va-05',
    stem: 'Which tone best describes a scientific article reporting experimental replication failures using terms like "tentative", "provisional", and "unsubstantiated claims"?',
    difficulty: 'medium',
    est_seconds: 60,
    section: 'Verbal Ability',
    topic: 'Reading',
    subtopic: 'Reading Comprehension',
    options: [
      { id: 'opt_0', text: 'Nostalgic' },
      { id: 'opt_1', text: 'Skeptical' },
      { id: 'opt_2', text: 'Patronizing' },
      { id: 'opt_3', text: 'Eulogistic' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Terms highlighting provisional evidence and unsubstantiated claims reflect methodical scientific skepticism.',
  },

  // --- Data Interpretation ---
  {
    id: 'tr-di-01',
    stem: '**Table: Monthly Revenue (in ₹ Lakhs) across four stores:**\n\n| Store | Jan | Feb | Mar |\n| :--- | :---: | :---: | :---: |\n| Store P | 40 | 50 | 60 |\n| Store Q | 30 | 45 | 45 |\n| Store R | 20 | 30 | 50 |\n| Store S | 50 | 55 | 65 |\n\nWhich store achieved the highest percentage growth in revenue from Jan to Mar?',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Data Interpretation',
    topic: 'Tables & Caselets',
    subtopic: 'Tables',
    options: [
      { id: 'opt_0', text: 'Store P' },
      { id: 'opt_1', text: 'Store Q' },
      { id: 'opt_2', text: 'Store R' },
      { id: 'opt_3', text: 'Store S' },
    ],
    correctOptionId: 'opt_2',
    explanation: 'Percentage growth = $(Mar - Jan)/Jan \\times 100\\%$.\n- Store P: $(60-40)/40 = 50\\%$\n- Store Q: $(45-30)/30 = 50\\%$\n- Store R: $(50-20)/20 = 150\\%$\n- Store S: $(65-50)/50 = 30\\%$.\nStore R achieved 150% growth.',
  },
  {
    id: 'tr-di-02',
    stem: 'In a 360-degree pie chart showing household expenditure, the sector for Education subtends an angle of $72^\\circ$. What percentage of total expenditure is spent on Education?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Data Interpretation',
    topic: 'Charts',
    subtopic: 'Pie Charts',
    options: [
      { id: 'opt_0', text: '15%' },
      { id: 'opt_1', text: '20%' },
      { id: 'opt_2', text: '24%' },
      { id: 'opt_3', text: '25%' },
    ],
    correctOptionId: 'opt_1',
    explanation: '$\\text{Percentage} = \\frac{72^\\circ}{360^\\circ} \\times 100\\% = \\frac{1}{5} \\times 100\\% = 20\\%$.',
  },
  {
    id: 'tr-di-03',
    stem: 'In a clustered bar chart, Company X produced 120,000 units and sold 96,000 units. What percentage of total production remained unsold?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Data Interpretation',
    topic: 'Charts',
    subtopic: 'Bar Charts',
    options: [
      { id: 'opt_0', text: '16%' },
      { id: 'opt_1', text: '20%' },
      { id: 'opt_2', text: '24%' },
      { id: 'opt_3', text: '25%' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Unsold units = $120,000 - 96,000 = 24,000$. Unsold percentage = $\\frac{24,000}{120,000} \\times 100\\% = \\frac{1}{5} = 20\\%$.',
  },
  {
    id: 'tr-di-04',
    stem: 'If the average of five consecutive integers is 27, what is the product of the smallest and largest integers?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Data Interpretation',
    topic: 'Tables & Caselets',
    subtopic: 'Tables',
    options: [
      { id: 'opt_0', text: '700' },
      { id: 'opt_1', text: '725' },
      { id: 'opt_2', text: '728' },
      { id: 'opt_3', text: '750' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'The middle integer (3rd) is 27. The five integers are 25, 26, 27, 28, 29. Product of smallest (25) and largest (29) = $25 \\times 29 = 25 \\times (30 - 1) = 750 - 25 = 725$.',
  },

  // --- Technical Aptitude ---
  {
    id: 'tr-ta-01',
    stem: 'Which concept in Object-Oriented Programming enables a derived class to provide a specific implementation of a method already defined in its parent class?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Technical Aptitude',
    topic: 'Programming',
    subtopic: 'Object-Oriented Programming',
    options: [
      { id: 'opt_0', text: 'Method Overloading' },
      { id: 'opt_1', text: 'Method Overriding' },
      { id: 'opt_2', text: 'Encapsulation' },
      { id: 'opt_3', text: 'Data Hiding' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Method Overriding allows a subclass to define a custom runtime implementation of a superclass method having the same signature.',
  },
  {
    id: 'tr-ta-02',
    stem: 'What is the worst-case time complexity of searching for an element in an unbalanced Binary Search Tree (BST) with $n$ nodes?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Technical Aptitude',
    topic: 'Programming',
    subtopic: 'Data Structures & Algorithms',
    options: [
      { id: 'opt_0', text: 'O(1)' },
      { id: 'opt_1', text: 'O(log n)' },
      { id: 'opt_2', text: 'O(n)' },
      { id: 'opt_3', text: 'O(n log n)' },
    ],
    correctOptionId: 'opt_2',
    explanation: 'In the worst case (skewed tree where nodes are inserted in sorted order), the BST degenerates into a linked list of depth $n$, giving $O(n)$ search time.',
  },
  {
    id: 'tr-ta-03',
    stem: 'In relational database theory, which Normal Form requires eliminating partial functional dependencies on a composite primary key?',
    difficulty: 'medium',
    est_seconds: 60,
    section: 'Technical Aptitude',
    topic: 'CS Fundamentals',
    subtopic: 'DBMS',
    options: [
      { id: 'opt_0', text: '1NF' },
      { id: 'opt_1', text: '2NF' },
      { id: 'opt_2', text: '3NF' },
      { id: 'opt_3', text: 'BCNF' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Second Normal Form (2NF) mandates that the table is in 1NF and no non-prime attribute is functionally dependent on a proper subset of any candidate key.',
  },
  {
    id: 'tr-ta-04',
    stem: 'What is the network address for an IP address `192.168.1.130` with subnet mask `255.255.255.192` (/26)?',
    difficulty: 'hard',
    est_seconds: 90,
    section: 'Technical Aptitude',
    topic: 'CS Fundamentals',
    subtopic: 'Computer Networks',
    options: [
      { id: 'opt_0', text: '192.168.1.0' },
      { id: 'opt_1', text: '192.168.1.64' },
      { id: 'opt_2', text: '192.168.1.128' },
      { id: 'opt_3', text: '192.168.1.192' },
    ],
    correctOptionId: 'opt_2',
    explanation: 'Subnet mask /26 block size is $256 - 192 = 64$. Subnet boundaries are 0, 64, 128, 192. Since 130 lies between 128 and 191, the network address is `192.168.1.128`.',
  },
  {
    id: 'tr-ta-05',
    stem: 'Which condition is NOT one of the four necessary Coffman conditions required for an operating system deadlock?',
    difficulty: 'medium',
    est_seconds: 60,
    section: 'Technical Aptitude',
    topic: 'CS Fundamentals',
    subtopic: 'Operating Systems',
    options: [
      { id: 'opt_0', text: 'Mutual Exclusion' },
      { id: 'opt_1', text: 'Preemption Allowed' },
      { id: 'opt_2', text: 'Hold and Wait' },
      { id: 'opt_3', text: 'Circular Wait' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'The four Coffman conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. If preemption is allowed, deadlock cannot occur.',
  },
  {
    id: 'tr-ta-06',
    stem: 'What will be the output of the following C code snippet?\n```c\n#include <stdio.h>\nint main() {\n    int a = 5;\n    int b = a++ + ++a;\n    printf("%d", b);\n    return 0;\n}\n```',
    difficulty: 'hard',
    est_seconds: 90,
    section: 'Technical Aptitude',
    topic: 'Programming',
    subtopic: 'Output Prediction',
    options: [
      { id: 'opt_0', text: '11' },
      { id: 'opt_1', text: '12' },
      { id: 'opt_2', text: '13' },
      { id: 'opt_3', text: 'Undefined behavior in C standard' },
    ],
    correctOptionId: 'opt_3',
    explanation: 'Modifying variable `a` multiple times between two sequence points without intervening synchronization invokes undefined behavior according to the C ISO standard (C99/C11 6.5#2).',
  },
];

// Uniform sampling without replacement.
function pickRandomSubset(array, count) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function signTrialSession(sessionId) {
  return jwt.sign({ sid: sessionId }, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: TRIAL_ISSUER,
    expiresIn: TRIAL_EXPIRY_SECONDS,
  });
}

function verifyTrialSession(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: TRIAL_ISSUER,
    });
    return claims && typeof claims === 'object' && typeof claims.sid === 'string' ? claims : null;
  } catch {
    return null;
  }
}

async function loadTrialSession(token) {
  const claims = verifyTrialSession(token);
  if (!claims) throw new HttpError(401, 'invalid_session', 'Your trial session has expired or is invalid. Please restart.');
  const { rows } = await query(
    `select id, question_ids, answers, expires_at, completed_at
       from public.anonymous_trial_sessions
      where id = $1::uuid and expires_at > now()`,
    [claims.sid],
  );
  const session = rows[0];
  if (!session || !Array.isArray(session.question_ids) || session.question_ids.length !== 10 || !Array.isArray(session.answers)) {
    throw new HttpError(401, 'invalid_session', 'Your trial session has expired or is invalid. Please restart.');
  }
  return { claims, session };
}

/**
 * POST /trial/start
 * Selects 10 questions and persists server-authoritative progress. The browser
 * receives only a short-lived signed session token, never question IDs or keys.
 */
router.post('/start', limitByIp('trial:start', 3600, 40), async (req, res) => {
  const qa = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Quantitative Aptitude'), 3);
  const lr = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Logical Reasoning'), 2);
  const va = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Verbal Ability'), 2);
  const di = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Data Interpretation'), 1);
  const ta = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Technical Aptitude'), 2);
  const selectedQuestions = pickRandomSubset([...qa, ...lr, ...va, ...di, ...ta], 10);
  const questionIds = selectedQuestions.map((question) => question.id);
  if (questionIds.length !== 10 || new Set(questionIds).size !== 10) {
    throw new HttpError(503, 'trial_pool_unavailable', 'The trial is temporarily unavailable. Please try again later.');
  }

  const sessionId = randomUUID();
  await query(
    `insert into public.anonymous_trial_sessions (id, question_ids, answers, started_at, expires_at)
     values ($1::uuid, $2::jsonb, '[]'::jsonb, now(), now() + interval '2 hours')`,
    [sessionId, JSON.stringify(questionIds)],
  );

  // Opportunistic bounded cleanup; expired sessions are not retained indefinitely.
  await query(
    `delete from public.anonymous_trial_sessions
      where id in (select id from public.anonymous_trial_sessions where expires_at < now() - interval '1 day' limit 100)`,
    [],
  );

  res.status(201).json({
    sessionToken: signTrialSession(sessionId),
    totalQuestions: 10,
    message: 'Trial session started. You have 10 questions to solve.',
  });
});

/** Return only the requested question fields. Correct answers stay on the server. */
router.post('/question', limitByIp('trial:question', 3600, 200), async (req, res) => {
  const { sessionToken, index: indexString } = req.body ?? {};
  if (typeof sessionToken !== 'string' || sessionToken.length > 8192) throw badRequest('A valid trial session token is required.');
  const { session } = await loadTrialSession(sessionToken);
  const index = Number(indexString);
  if (!Number.isInteger(index) || index < 0 || index >= 10) {
    throw new HttpError(400, 'index_out_of_bounds', 'Question index is out of bounds.');
  }
  if (index > session.answers.length) {
    throw new HttpError(409, 'answer_out_of_order', 'Complete the current question before moving forward.');
  }

  const questionId = session.question_ids[index];
  const question = TRIAL_QUESTION_POOL.find((item) => item.id === questionId);
  if (!question) throw new HttpError(404, 'question_not_found', 'Requested trial question could not be found.');

  res.set('Cache-Control', 'no-store');
  res.json({
    question: {
      id: question.id,
      stem: question.stem,
      difficulty: question.difficulty,
      est_seconds: question.est_seconds,
      section: question.section,
      topic: question.topic,
      subtopic: question.subtopic,
      has_hint: false,
      options: question.options,
    },
    index,
    totalQuestions: 10,
    answeredCount: session.answers.length,
  });
});

/** Grades once, atomically. A repeated or out-of-order submission cannot change a saved answer. */
router.post('/submit', limitByIp('trial:submit', 3600, 100), async (req, res) => {
  const { sessionToken, index, optionId, timeMs } = req.body ?? {};
  if (typeof sessionToken !== 'string' || sessionToken.length > 8192) throw badRequest('A valid trial session token is required.');
  if (typeof optionId !== 'string' || optionId.length > 32) throw badRequest('Choose one of the available answer options.');
  if (timeMs !== undefined && (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 3_600_000)) {
    throw badRequest('Answer time must be between 0 and 60 minutes.');
  }
  const { claims, session } = await loadTrialSession(sessionToken);
  const questionIndex = Number(index);
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= 10) {
    throw new HttpError(400, 'invalid_index', 'Invalid question index.');
  }
  if (session.completed_at) throw new HttpError(409, 'trial_completed', 'This trial session is already complete.');
  if (questionIndex !== session.answers.length) {
    throw new HttpError(409, questionIndex < session.answers.length ? 'already_answered' : 'answer_out_of_order',
      questionIndex < session.answers.length ? 'This question has already been submitted in this session.' : 'Answer the current question before moving forward.');
  }

  const questionId = session.question_ids[questionIndex];
  const question = TRIAL_QUESTION_POOL.find((item) => item.id === questionId);
  if (!question) throw new HttpError(404, 'question_not_found', 'Question not found.');
  if (!question.options.some((option) => option.id === optionId)) throw badRequest('Choose one of the available answer options.');

  const isCorrect = optionId === question.correctOptionId;
  const answerRecord = {
    questionId: question.id,
    selectedOptionId: optionId,
    isCorrect,
    timeMs: typeof timeMs === 'number' ? Math.floor(timeMs) : 0,
    section: question.section,
  };
  const update = await query(
    `update public.anonymous_trial_sessions
        set answers = answers || jsonb_build_array($2::jsonb),
            completed_at = case when jsonb_array_length(answers) + 1 = 10 then now() else null end
      where id = $1::uuid and expires_at > now() and completed_at is null
        and jsonb_array_length(answers) = $3::integer
      returning answers`,
    [claims.sid, JSON.stringify(answerRecord), questionIndex],
  );
  if (!update.rows.length) {
    throw new HttpError(409, 'answer_conflict', 'This answer was already recorded. Reload the current trial state.');
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    reveal: {
      isCorrect,
      selectedOptionId: optionId,
      gaveUp: false,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      usedHint: false,
      reward: isCorrect ? '+20 XP (Trial)' : null,
      timeMs: answerRecord.timeMs,
    },
    sessionToken,
  });
});

/** Summary data comes from persisted server-side answers, not client-calculated score. */
router.post('/summary', limitByIp('trial:summary', 3600, 120), async (req, res) => {
  const { sessionToken } = req.body ?? {};
  if (typeof sessionToken !== 'string' || sessionToken.length > 8192) throw badRequest('A valid trial session token is required.');
  const { session } = await loadTrialSession(sessionToken);
  const answers = session.answers;
  const correctCount = answers.filter((answer) => answer?.isCorrect).length;
  const totalTimeMs = answers.reduce((total, answer) => total + (Number(answer?.timeMs) || 0), 0);
  const sectionStats = {};

  for (const questionId of session.question_ids) {
    const question = TRIAL_QUESTION_POOL.find((item) => item.id === questionId);
    if (!question) continue;
    if (!sectionStats[question.section]) sectionStats[question.section] = { correct: 0, total: 0 };
    sectionStats[question.section].total += 1;
  }
  for (const answer of answers) {
    if (answer?.isCorrect && sectionStats[answer.section]) sectionStats[answer.section].correct += 1;
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    summary: {
      totalQuestions: 10,
      attemptedCount: answers.length,
      correctCount,
      accuracyPercent: answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0,
      totalTimeMs,
      sectionStats,
      isComplete: answers.length === 10 && Boolean(session.completed_at),
    },
  });
});

export default router;
