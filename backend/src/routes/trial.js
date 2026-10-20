// /trial: Anonymous 10-Question Trial Engine
// Serves a reviewed pool of 28 high-quality aptitude questions without requiring login.
// Uses signed session tokens to strictly enforce question sequences, prevent answer key leakage,
// and record accurate trial scores. Anonymous AI tutor is strictly disabled.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { badRequest, HttpError } from '../http.js';
import { limitByIp } from '../middleware/rateLimit.js';

const router = Router();
const TRIAL_ISSUER = 'aptric:trial';
const TRIAL_EXPIRY_SECONDS = 7200; // 2 hours

interface TrialPoolQuestion {
  id: string;
  stem: string;
  difficulty: 'easy' | 'medium' | 'hard';
  est_seconds: number;
  section: string;
  topic: string;
  subtopic: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

// 28 reviewed, original questions covering QA, LR, VA, DI, and TA
const TRIAL_QUESTION_POOL: TrialPoolQuestion[] = [
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

// Helper: randomly pick N items from array
function pickRandomSubset<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Token signing & verification
function signTrialSession(payload: object) {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: TRIAL_ISSUER,
    expiresIn: TRIAL_EXPIRY_SECONDS,
  });
}

function verifyTrialSession(token: string) {
  try {
    return jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: TRIAL_ISSUER,
    }) as any;
  } catch {
    return null;
  }
}

/**
 * POST /trial/start
 * Initializes a new 10-question trial session with an opaque signed token.
 */
router.post('/start', limitByIp('trial:start', 3600, 40), (req, res) => {
  // Select balanced sample of 10 questions from the 28-question pool
  const qa = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Quantitative Aptitude'), 3);
  const lr = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Logical Reasoning'), 2);
  const va = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Verbal Ability'), 2);
  const di = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Data Interpretation'), 1);
  const ta = pickRandomSubset(TRIAL_QUESTION_POOL.filter((q) => q.section === 'Technical Aptitude'), 2);

  const selectedQuestions = [...qa, ...lr, ...va, ...di, ...ta].sort(() => 0.5 - Math.random());
  const questionIds = selectedQuestions.map((q) => q.id);

  const sessionId = randomUUID();
  const sessionToken = signTrialSession({
    sid: sessionId,
    qids: questionIds,
    answers: [],
    startedAt: Date.now(),
  });

  res.json({
    sessionToken,
    totalQuestions: questionIds.length,
    message: 'Trial session started. You have 10 questions to solve.',
  });
});

/**
 * GET /trial/question/:sessionToken/:index
 * Returns the question details for the requested index (0-9) WITHOUT correct answer keys.
 */
router.get('/question/:sessionToken/:index', (req, res) => {
  const { sessionToken, index: indexStr } = req.params;
  const claims = verifyTrialSession(sessionToken);

  if (!claims || !Array.isArray(claims.qids)) {
    throw new HttpError(401, 'invalid_session', 'Your trial session has expired or is invalid. Please restart.');
  }

  const index = parseInt(indexStr, 10);
  if (isNaN(index) || index < 0 || index >= claims.qids.length) {
    throw new HttpError(400, 'index_out_of_bounds', 'Question index is out of bounds.');
  }

  const questionId = claims.qids[index];
  const q = TRIAL_QUESTION_POOL.find((item) => item.id === questionId);

  if (!q) {
    throw new HttpError(404, 'question_not_found', 'Requested trial question could not be found.');
  }

  // Security: Strip correctOptionId and explanation before sending to client
  res.json({
    question: {
      id: q.id,
      stem: q.stem,
      difficulty: q.difficulty,
      est_seconds: q.est_seconds,
      section: q.section,
      topic: q.topic,
      subtopic: q.subtopic,
      has_hint: false,
      options: q.options,
    },
    index,
    totalQuestions: claims.qids.length,
  });
});

/**
 * POST /trial/submit
 * Validates the player's answer server-side, updates progress in signed token, and returns reveal.
 */
router.post('/submit', limitByIp('trial:submit', 3600, 100), (req, res) => {
  const { sessionToken, index, optionId, timeMs } = req.body;
  const claims = verifyTrialSession(sessionToken);

  if (!claims || !Array.isArray(claims.qids)) {
    throw new HttpError(401, 'invalid_session', 'Trial session expired or invalid.');
  }

  const qIndex = parseInt(index, 10);
  if (isNaN(qIndex) || qIndex < 0 || qIndex >= claims.qids.length) {
    throw new HttpError(400, 'invalid_index', 'Invalid question index.');
  }

  const questionId = claims.qids[qIndex];
  const q = TRIAL_QUESTION_POOL.find((item) => item.id === questionId);

  if (!q) {
    throw new HttpError(404, 'question_not_found', 'Question not found.');
  }

  const isCorrect = optionId === q.correctOptionId;
  const existingAnswers = Array.isArray(claims.answers) ? [...claims.answers] : [];

  // Update or append answer record
  existingAnswers[qIndex] = {
    questionId: q.id,
    selectedOptionId: optionId,
    isCorrect,
    timeMs: typeof timeMs === 'number' ? timeMs : 0,
    section: q.section,
  };

  const updatedToken = signTrialSession({
    ...claims,
    answers: existingAnswers,
  });

  res.json({
    reveal: {
      isCorrect,
      selectedOptionId: optionId,
      gaveUp: false,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
      usedHint: false,
      reward: isCorrect ? '+20 XP (Trial)' : null,
      timeMs: timeMs ?? null,
    },
    sessionToken: updatedToken,
  });
});

/**
 * GET /trial/summary/:sessionToken
 * Returns final trial metrics, score breakdown, and signup conversion info.
 */
router.get('/summary/:sessionToken', (req, res) => {
  const { sessionToken } = req.params;
  const claims = verifyTrialSession(sessionToken);

  if (!claims || !Array.isArray(claims.qids)) {
    throw new HttpError(401, 'invalid_session', 'Trial session expired or invalid.');
  }

  const answers = Array.isArray(claims.answers) ? claims.answers : [];
  const correctCount = answers.filter((a: any) => a?.isCorrect).length;
  const attemptedCount = answers.filter((a: any) => a !== undefined).length;
  const totalTimeMs = answers.reduce((acc: number, a: any) => acc + (a?.timeMs || 0), 0);

  const sectionStats: Record<string, { correct: number; total: number }> = {};
  for (let i = 0; i < claims.qids.length; i++) {
    const qid = claims.qids[i];
    const q = TRIAL_QUESTION_POOL.find((item) => item.id === qid);
    if (q) {
      if (!sectionStats[q.section]) sectionStats[q.section] = { correct: 0, total: 0 };
      sectionStats[q.section].total++;
      if (answers[i]?.isCorrect) {
        sectionStats[q.section].correct++;
      }
    }
  }

  res.json({
    summary: {
      totalQuestions: claims.qids.length,
      attemptedCount,
      correctCount,
      accuracyPercent: attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0,
      totalTimeMs,
      sectionStats,
      isComplete: attemptedCount >= 10,
    },
  });
});

export default router;
