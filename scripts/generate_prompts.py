import os

subtopics_data = [
    # Quantitative Aptitude (21)
    {
        'num': '01',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'number-system', 'sub_name': 'Number System',
        'skills': 'Classify real number types; apply divisibility tests (2-19); calculate unit digits and cyclicity; find factors, multiples, HCF, LCM, and trailing zeros in factorials.',
        'concepts': 'Classification of numbers (primes, composites, rational, irrational); Divisibility rules; Prime factorization and number of factors; Remainder theorems; Cyclicity of units digit; Trailing zeroes.',
        'subject_rule': 'Show derivations; use small verifiable numbers first; state remainder conditions; verify edge cases (0, 1, negatives).'
    },
    {
        'num': '02',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'percentages', 'sub_name': 'Percentages',
        'skills': 'Convert between fractions, decimals, and percentages; compute percentage increase/decrease; calculate successive percentage changes; handle reverse percentages.',
        'concepts': 'Base values and percentage concept; Fraction-to-percentage equivalence table (1/2 to 1/20); Percentage increase/decrease; Net successive percentage change: a + b + ab/100; Reverse percentages (finding original value).',
        'subject_rule': 'Distinguish base values from percentage changes; show units; explain successive changes carefully; verify results by substitution or independent method.'
    },
    {
        'num': '03',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'profit-and-loss', 'sub_name': 'Profit & Loss',
        'skills': 'Differentiate Cost Price (CP), Selling Price (SP), and Marked Price (MP); calculate profit/loss percentages; handle single and successive discounts; solve dishonest dealer problems.',
        'concepts': 'CP, SP, Profit, Loss formulas based on CP; Marked price and discount based on MP; Successive discounts d1, d2; False weights and dishonest dealer formulas; Break-even analysis.',
        'subject_rule': 'Always explicitly state the reference base (CP for profit/loss, MP for discount); verify dishonest weight scenarios with volume/weight ratios.'
    },
    {
        'num': '04',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'simple-and-compound-interest', 'sub_name': 'Simple & Compound Interest',
        'skills': 'Compute Simple Interest (SI) and Compound Interest (CI); handle annual, half-yearly, and quarterly compounding; calculate the difference between CI and SI for 2 and 3 years.',
        'concepts': 'SI formula P*R*T/100; CI formula P(1 + R/100)^n; Effective interest rate for half-yearly/quarterly compounding; Difference between CI and SI for 2 years: P(R/100)^2; Rule of 72.',
        'subject_rule': 'Differentiate linear growth (SI) from exponential growth (CI); state time periods and rate conversions clearly.'
    },
    {
        'num': '05',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'ratio-and-proportion', 'sub_name': 'Ratio & Proportion',
        'skills': 'Simplify ratios; solve direct and inverse proportions; divide quantities according to given ratios; solve partnership investment problems.',
        'concepts': 'Definition of ratio and duplicate/triplicate ratios; Mean, third, and fourth proportional; Direct vs inverse variation; Division of amount in ratio a:b:c; Partnership profit division based on Capital * Time.',
        'subject_rule': 'Maintain consistent units before forming ratios; check proportional scaling laws.'
    },
    {
        'num': '06',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'averages', 'sub_name': 'Averages',
        'skills': 'Calculate arithmetic mean and weighted averages; solve missing or replaced value problems; determine average speed over equal and unequal segments.',
        'concepts': 'Sum / Count = Average; Deviation method (assumed mean method); Weighted average: (w1*x1 + w2*x2)/(w1 + w2); Inclusion and exclusion of elements; Harmonic mean for average speed with equal distances.',
        'subject_rule': 'Distinguish average speed from arithmetic average of speeds; show deviation method as a time-saving alternative.'
    },
    {
        'num': '07',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'mixtures-and-alligations', 'sub_name': 'Mixtures & Alligations',
        'skills': 'Calculate concentration in combined solutions; apply the rule of alligation; solve repeated dilution and replacement problems.',
        'concepts': 'Concentration and purity; Rule of Alligation diagram and cross-subtraction; Ratio of ingredients = (Cheaper diff) / (Dearer diff); Repeated removal and replacement formula: Q = Initial * (1 - x/V)^n.',
        'subject_rule': 'State alligation reference points clearly; verify alligation line differences before setting ratios.'
    },
    {
        'num': '08',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'arithmetic', 'top_name': 'Arithmetic',
        'sub_slug': 'problems-on-ages', 'sub_name': 'Problems on Ages',
        'skills': 'Translate verbal age statements into algebraic equations; solve linear age systems; utilize constant age difference properties.',
        'concepts': 'Present age variable representation; Past (x - n) and future (x + n) age representations; Invariant property: the age difference between two persons remains constant over time; Ratio method for age problems.',
        'subject_rule': 'Ensure the reference point (present age) is explicit; check that solved ages are non-negative real numbers.'
    },
    {
        'num': '09',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'time-work-distance', 'top_name': 'Time, Work & Distance',
        'sub_slug': 'time-and-work', 'sub_name': 'Time & Work',
        'skills': 'Calculate individual and combined work rates; apply the LCM (total units of work) method; compute work and wage distribution; solve alternate day work problems.',
        'concepts': 'Work = Rate * Time; Reciprocal work rate vs LCM unit work method; Efficiency ratios; Men-Days-Hours-Work relation (M1*D1*H1/W1 = M2*D2*H2/W2); Alternate working cycles.',
        'subject_rule': 'Define rates and units; recommend the LCM method over fractional arithmetic; check complete cycle vs remaining work.'
    },
    {
        'num': '10',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'time-work-distance', 'top_name': 'Time, Work & Distance',
        'sub_slug': 'pipes-and-cisterns', 'sub_name': 'Pipes & Cisterns',
        'skills': 'Handle inlet (filling) and outlet (emptying/leak) pipes; compute net filling rate using LCM method; solve alternately operated valves.',
        'concepts': 'Positive rate for inlet pipes, negative rate for outlet pipes; Net rate = Fill Rate - Empty Rate; Tank capacity assumption via LCM; Leak problems and effective time calculation.',
        'subject_rule': 'Always explicitly apply negative sign to outlet pipes; check if tank ever reaches zero capacity.'
    },
    {
        'num': '11',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'time-work-distance', 'top_name': 'Time, Work & Distance',
        'sub_slug': 'time-speed-distance', 'sub_name': 'Time, Speed & Distance',
        'skills': 'Convert km/h to m/s (5/18 factor); apply Distance = Speed * Time; calculate relative speeds in opposite and same directions; solve meeting point problems.',
        'concepts': 'Unit conversion: 1 km/h = 5/18 m/s; Relative speed when moving towards each other (S1 + S2) and same direction (S1 - S2); Meeting time = Initial Distance / Relative Speed; Constant distance/time proportionality.',
        'subject_rule': 'Use consistent time and distance units; verify meeting time relative to start time.'
    },
    {
        'num': '12',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'time-work-distance', 'top_name': 'Time, Work & Distance',
        'sub_slug': 'trains', 'sub_name': 'Problems on Trains',
        'skills': 'Calculate time taken by a train to cross stationary points (poles, persons) and extended objects (platforms, bridges, tunnels); solve two passing trains.',
        'concepts': 'Train crossing point object: Distance = Length of train; Train crossing platform/bridge: Distance = Length of train + Length of platform; Two trains crossing each other: Distance = L1 + L2, Relative Speed = S1 +- S2.',
        'subject_rule': 'Ensure train lengths in meters and speeds in m/s are harmonized; check orientation of trains.'
    },
    {
        'num': '13',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'time-work-distance', 'top_name': 'Time, Work & Distance',
        'sub_slug': 'boats-and-streams', 'sub_name': 'Boats & Streams',
        'skills': 'Calculate downstream and upstream speeds; determine speed of boat in still water and speed of stream; solve round-trip river problems.',
        'concepts': 'Speed in still water (u), Speed of stream (v); Downstream speed (d) = u + v; Upstream speed (u_s) = u - v; u = (d + u_s)/2; v = (d - u_s)/2; Time taken for round trip.',
        'subject_rule': 'Ensure boat speed u > stream speed v for upstream motion; check physical feasibility.'
    },
    {
        'num': '14',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'counting-and-probability', 'top_name': 'Counting & Probability',
        'sub_slug': 'permutations-and-combinations', 'sub_name': 'Permutations & Combinations',
        'skills': 'Apply Fundamental Counting Principles (addition & multiplication); compute nPr and nCr; solve arrangement problems with restrictions, vowels together, and circular arrangements.',
        'concepts': 'Difference between ordering (Permutation) and selection (Combination); Factorial formulas n! / (n-r)! and n! / (r!(n-r)!); String/box method for keeping items together; Circular permutations (n-1)!; Combinations with repetition.',
        'subject_rule': 'Define the sample space; distinguish whether order matters; check edge cases n=0, r=0.'
    },
    {
        'num': '15',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'counting-and-probability', 'top_name': 'Counting & Probability',
        'sub_slug': 'probability', 'sub_name': 'Probability',
        'skills': 'Define sample spaces for coins, dice, and cards; calculate theoretical probability; apply addition theorem P(A U B) and multiplication theorem for independent events; solve conditional probability.',
        'concepts': 'Classical probability: Favorable outcomes / Total outcomes; Complementary event P(A\') = 1 - P(A); Mutually exclusive vs independent events; P(A U B) = P(A) + P(B) - P(A n B); Conditional probability P(A|B).',
        'subject_rule': 'Verify all computed probabilities are strictly within [0, 1]; check non-overlapping outcome classifications.'
    },
    {
        'num': '16',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'geometry-and-mensuration', 'top_name': 'Geometry & Mensuration',
        'sub_slug': 'mensuration', 'sub_name': 'Mensuration',
        'skills': 'Calculate area and perimeter of 2D shapes (rectangles, triangles, circles, trapezoids); compute surface area and volume of 3D solids (cubes, cylinders, cones, spheres).',
        'concepts': '2D perimeter and area formulas; Heron\'s formula; 3D Total Surface Area, Curved Surface Area, and Volume formulas; Melting, recasting, and conversion of solids (invariance of volume).',
        'subject_rule': 'State units explicitly (cm, cm^2, cm^3); show step-by-step simplification of pi calculations.'
    },
    {
        'num': '17',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'geometry-and-mensuration', 'top_name': 'Geometry & Mensuration',
        'sub_slug': 'geometry', 'sub_name': 'Geometry',
        'skills': 'Apply properties of parallel lines and angles; verify triangle congruence and similarity criteria; utilize circle theorems (tangents, chords, cyclic quadrilaterals).',
        'concepts': 'Angle types (alternate, corresponding, interior); Triangle angle sum, Pythagoras theorem, and similarity (AA, SAS, SSS); Circle chord properties, angle subtended at center vs circumference; Tangent-secant theorem.',
        'subject_rule': 'Define diagrams precisely in text; state theorem hypotheses before invoking conclusions.'
    },
    {
        'num': '18',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'algebra', 'top_name': 'Algebra',
        'sub_slug': 'equations-and-inequalities', 'sub_name': 'Equations & Inequalities',
        'skills': 'Solve linear and quadratic equations; analyze roots using discriminant (b^2 - 4ac); solve linear inequalities and express solutions in interval notation.',
        'concepts': 'Linear equations in 1 and 2 variables; Quadratic formula x = (-b +- sqrt(D)) / 2a; Nature of roots based on D; Sum and product of roots (Vieta\'s formulas); Rules for flipping inequalities upon negative multiplication.',
        'subject_rule': 'Check for extraneous roots; highlight the sign reversal rule when multiplying/dividing inequalities by negative numbers.'
    },
    {
        'num': '19',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'algebra', 'top_name': 'Algebra',
        'sub_slug': 'progressions', 'sub_name': 'Progressions',
        'skills': 'Identify Arithmetic Progressions (AP) and Geometric Progressions (GP); find nth term and sum of first n terms; solve infinite geometric series; calculate arithmetic and geometric means.',
        'concepts': 'AP nth term: a + (n-1)d, Sum: n/2 * (2a + (n-1)d); GP nth term: a*r^(n-1), Sum: a(r^n - 1)/(r - 1); Sum of infinite GP: a / (1 - r) for |r| < 1; AM >= GM inequality.',
        'subject_rule': 'State convergence criteria for infinite GP; verify common difference d and common ratio r.'
    },
    {
        'num': '20',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'algebra', 'top_name': 'Algebra',
        'sub_slug': 'logarithms', 'sub_name': 'Logarithms',
        'skills': 'Convert between exponential and logarithmic forms; apply log laws (product, quotient, power, change of base); solve logarithmic equations and determine characteristics/mantissas.',
        'concepts': 'Definition: log_b(x) = y <=> b^y = x with b > 0, b != 1, x > 0; Laws: log(xy) = log x + log y, log(x/y) = log x - log y, log(x^k) = k log x; Change of base theorem: log_b(a) = log_c(a) / log_c(b).',
        'subject_rule': 'Always check the domain of validity (argument > 0, base > 0 and != 1) to eliminate extraneous roots.'
    },
    {
        'num': '21',
        'sec_slug': 'quantitative-aptitude', 'sec_name': 'Quantitative Aptitude',
        'top_slug': 'data-sufficiency', 'top_name': 'Data Sufficiency',
        'sub_slug': 'data-sufficiency', 'sub_name': 'Data Sufficiency',
        'skills': 'Evaluate whether given statements are sufficient to answer a problem without unnecessary complete calculation; apply standard 5-option decision logic.',
        'concepts': 'Standard 5 options (Statement 1 alone sufficient, Statement 2 alone sufficient, Both together needed, Each alone sufficient, Neither sufficient); Unique answer requirement; Common traps: assuming unstated conditions (e.g. integer vs real).',
        'subject_rule': 'Emphasize answering "can it be uniquely determined?" rather than finding the exact numerical value; test edge cases.'
    },

    # Logical Reasoning (13)
    {
        'num': '22',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'verbal-reasoning', 'top_name': 'Verbal Reasoning',
        'sub_slug': 'series', 'sub_name': 'Number & Letter Series',
        'skills': 'Identify arithmetic, geometric, alternating, difference-of-differences, and polynomial series patterns; solve alphanumeric and repeating letter series.',
        'concepts': 'Types of number series (prime, squares/cubes, fibonacci, alternating operations); Step-difference analysis; Letter position numbering (A=1, Z=26) and reverse numbering; Continuous pattern letter series.',
        'subject_rule': 'Explain the inferred rule; test it against all given terms; verify that the rule is mathematically robust and unambiguous.'
    },
    {
        'num': '23',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'verbal-reasoning', 'top_name': 'Verbal Reasoning',
        'sub_slug': 'coding-decoding', 'sub_name': 'Coding-Decoding',
        'skills': 'Decode letter shifting, reverse alphabet, substitution, and direct symbol coding; solve fictitious language message deciphering.',
        'concepts': 'Forward and backward letter shift patterns (+k, -k); Opposite letter pairs (A-Z, B-Y, etc., sum = 27); Substitution coding; Matrix and message comparison (finding common words across sentences).',
        'subject_rule': 'Show systematic letter-to-number mapping; verify the rule across every character of the sample word.'
    },
    {
        'num': '24',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'verbal-reasoning', 'top_name': 'Verbal Reasoning',
        'sub_slug': 'blood-relations', 'sub_name': 'Blood Relations',
        'skills': 'Construct standardized family tree diagrams; interpret generation levels and gender symbols; solve coded blood relations and pointing-to-photograph puzzles.',
        'concepts': 'Standard notation (+ for male, - for female, = for spouses, | for generations, - for siblings); Generation gaps; Paternal vs maternal relations; Coded relation symbols (A + B means A is father of B).',
        'subject_rule': 'Never assume gender from a person\'s name unless explicitly stated; verify the question asks "how is X related to Y" vs "Y related to X".'
    },
    {
        'num': '25',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'verbal-reasoning', 'top_name': 'Verbal Reasoning',
        'sub_slug': 'direction-sense', 'sub_name': 'Direction Sense',
        'skills': 'Map 8 cardinal and intercardinal directions; track turns (left/right, clockwise/counter-clockwise in degrees); calculate shortest displacement using Pythagoras theorem.',
        'concepts': 'Compass rose (N, S, E, W, NE, NW, SE, SW); Direction changes upon 90-degree left/right turns; Shadow directions in morning (west) and evening (east); Distance between start and finish via coordinate vectors.',
        'subject_rule': 'Provide clear coordinate or grid tracing; verify angle and orientation conventions.'
    },
    {
        'num': '26',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'arrangements-and-puzzles', 'top_name': 'Arrangements & Puzzles',
        'sub_slug': 'seating-arrangement', 'sub_name': 'Seating Arrangement',
        'skills': 'Solve linear seating arrangements (single row, parallel rows, facing North/South); solve circular and polygonal arrangements (facing center, facing outward, mixed).',
        'concepts': 'Linear row placement: Left and Right relative to facing direction; Circular arrangements: Clockwise vs Counter-Clockwise depending on inward/outward facing; Definite clues vs relative clues; Case splitting for ambiguities.',
        'subject_rule': 'Establish consistent orientation; show step-by-step constraint satisfaction and eliminate invalid parallel cases.'
    },
    {
        'num': '27',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'arrangements-and-puzzles', 'top_name': 'Arrangements & Puzzles',
        'sub_slug': 'puzzles', 'sub_name': 'Puzzles',
        'skills': 'Construct multi-attribute grid/matrix tables; solve floor-based, box-based, day/month scheduling, and distribution puzzles.',
        'concepts': 'Grid/table matrix representation; Direct positive clues, negative clues, and conditional clues; Systematic elimination; Verification that the solution satisfies 100% of the given conditions.',
        'subject_rule': 'Provide clear textual tables for each step; avoid unverified heuristic leaps.'
    },
    {
        'num': '28',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'arrangements-and-puzzles', 'top_name': 'Arrangements & Puzzles',
        'sub_slug': 'input-output', 'sub_name': 'Input-Output',
        'skills': 'Identify machine shifting patterns; track step-by-step rearrangement of numbers and words (alphabetical, length, ascending, descending, alternating); predict intermediate and final steps.',
        'concepts': 'Sequential machine rearrangement rules; Left-end, right-end, and simultaneous dual-end shifting; Number sorting logic (parity, sum of digits); Determining whether an earlier step can be uniquely reconstructed from a later step.',
        'subject_rule': 'Demonstrate full step tracing; clarify why previous steps cannot be deduced backwards when shifting overwrite occurs.'
    },
    {
        'num': '29',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'deductive-reasoning', 'top_name': 'Deductive Reasoning',
        'sub_slug': 'syllogism', 'sub_name': 'Syllogism',
        'skills': 'Evaluate categorical propositions using Venn diagrams and tick-cross / 100-50 rules; handle "All", "Some", "No", "Some not", "Only a few", and "Possibility" conclusions.',
        'concepts': 'Standard 4 propositions (A, E, I, O); Venn diagram representation; Minimal overlap method vs possibility testing; "Only a few A are B" = Some A are B AND Some A are not B; Either-Or complementary pairs (Some + No, All + Some not).',
        'subject_rule': 'Distinguish definite conclusions from possibilities; never rely on real-world empirical truth over formal logic.'
    },
    {
        'num': '30',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'deductive-reasoning', 'top_name': 'Deductive Reasoning',
        'sub_slug': 'statement-and-conclusion', 'sub_name': 'Statement & Conclusion',
        'skills': 'Distinguish direct logical conclusions from assumptions and external opinions; determine whether a conclusion follows beyond reasonable doubt solely from given statements.',
        'concepts': 'Definition of valid deductive conclusion; Rules: must be directly supported by premise, no external knowledge, avoid extreme words ("always", "never", "all" unless in premise); Difference between assumption, inference, and conclusion.',
        'subject_rule': 'Strictly adhere to the statement boundary; explain why plausible real-world statements must be rejected if unsupported by the premise.'
    },
    {
        'num': '31',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'clocks-and-calendars', 'top_name': 'Clocks & Calendars',
        'sub_slug': 'clocks', 'sub_name': 'Clocks',
        'skills': 'Calculate angle between clock hands at given times; find exact times of coincidence (0 deg), right angle (90 deg), and opposition (180 deg); solve slow and fast faulty clock problems.',
        'concepts': 'Speed of minute hand (6 deg/min) and hour hand (0.5 deg/min); Relative speed = 5.5 deg/min (11/2 deg/min); Angle formula theta = |30*H - 5.5*M|; Coincidence occurs every 65 5/11 minutes; Clock gain/loss error calculations.',
        'subject_rule': 'Show derivations of the 11/2 factor; handle angle wrapping past 180 degrees (reflex angle).'
    },
    {
        'num': '32',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'clocks-and-calendars', 'top_name': 'Clocks & Calendars',
        'sub_slug': 'calendars', 'sub_name': 'Calendars',
        'skills': 'Determine odd days across ordinary and leap years, months, and centuries; find the day of the week for any historical or future date; identify repeating calendar years.',
        'concepts': 'Gregorian calendar rules (leap year divisible by 4, century divisible by 400); Odd days: Ordinary year = 1, Leap year = 2; Century odd days (100 yrs = 5, 200 yrs = 3, 300 yrs = 1, 400 yrs = 0); Calendar repetition cycle (+6, +11, +28).',
        'subject_rule': 'Clearly define reference anchor dates; trace modulo 7 arithmetic step-by-step.'
    },
    {
        'num': '33',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'non-verbal-reasoning', 'top_name': 'Non-Verbal Reasoning',
        'sub_slug': 'cubes-and-dice', 'sub_name': 'Cubes & Dice',
        'skills': 'Determine opposite faces on standard and ordinary dice from multiple views; solve painted large cube cutting problems (faces with 3, 2, 1, 0 colors); fold 2D unfolded nets into 3D cubes.',
        'concepts': 'Standard dice (opposite sum = 7) vs General dice; Common face rule (rotate clockwise from common number); Painted cube formulas for n cuts per edge: 3-face = 8 (corners), 2-face = 12(n-2) (edges), 1-face = 6(n-2)^2 (faces), 0-face = (n-2)^3 (interior).',
        'subject_rule': 'Provide clear visual or spatial descriptions of nets; show rotation alignment rules.'
    },
    {
        'num': '34',
        'sec_slug': 'logical-reasoning', 'sec_name': 'Logical Reasoning',
        'top_slug': 'non-verbal-reasoning', 'top_name': 'Non-Verbal Reasoning',
        'sub_slug': 'venn-diagrams', 'sub_name': 'Venn Diagrams',
        'skills': 'Select appropriate Venn diagram configurations representing conceptual relationships among three entities; solve quantitative 2-set and 3-set overlapping data problems.',
        'concepts': 'Conceptual Venn classifications (subset/containment, disjoint, intersecting); 3-set union formula: n(A U B U C); Formula for "exactly one", "exactly two", and "all three" regions; Set diagram equation solving.',
        'subject_rule': 'Clearly differentiate conceptual relationship diagrams from quantitative region count calculations.'
    },

    # Verbal Ability (7)
    {
        'num': '35',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'reading', 'top_name': 'Reading',
        'sub_slug': 'reading-comprehension', 'sub_name': 'Reading Comprehension',
        'skills': 'Identify central idea and author\'s tone; differentiate direct facts from textual inferences; answer vocabulary-in-context questions; evaluate supporting arguments.',
        'concepts': 'Active reading techniques; Main idea vs supporting detail; Inferential reading (what must be true based on the passage); Tone identification (critical, analytical, didactic, optimistic, skeptical); Elimination of extreme or out-of-scope answer choices.',
        'subject_rule': 'Teach evidence-based inference; avoid subjective assertions without direct textual support; provide a compact 300-word sample passage for demonstration.'
    },
    {
        'num': '36',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'reading', 'top_name': 'Reading',
        'sub_slug': 'para-jumbles', 'sub_name': 'Para Jumbles',
        'skills': 'Identify introductory opening sentences; locate mandatory paired sentences using transition words, pronouns, and chronological markers; reconstruct coherent paragraphs.',
        'concepts': 'Anatomy of an opening sentence (independent, introduces subject, no unreferenced pronouns); Mandatory pairing techniques (Noun-Pronoun sequence, Acronym-Full Form, Cause-Effect, Chronology, Discourse markers); Elimination of invalid option permutations.',
        'subject_rule': 'Show exact structural cohesion clues; explain why plausible alternate sequences fail to maintain thematic continuity.'
    },
    {
        'num': '37',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'reading', 'top_name': 'Reading',
        'sub_slug': 'cloze-test', 'sub_name': 'Cloze Test',
        'skills': 'Evaluate context clues, tone, and grammar in continuous passages with missing words; apply collocation and part-of-speech filtering to select precise vocabulary.',
        'concepts': 'Passage skimming for global meaning; Tone and sentiment matching; Grammar and syntactic requirements of the blank (noun, verb tense, preposition); Collocations and phrasal verb combinations; Elimination by nuance.',
        'subject_rule': 'Demonstrate how the sentence before and after the blank dictates the choice; explain subtle shade-of-meaning distinctions.'
    },
    {
        'num': '38',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'grammar', 'top_name': 'Grammar & Usage',
        'sub_slug': 'sentence-correction', 'sub_name': 'Sentence Correction',
        'skills': 'Detect and correct errors in subject-verb agreement, pronoun antecedent reference, verb tense consistency, modifier placement (dangling/misplaced), and parallelism.',
        'concepts': 'Subject-Verb Agreement rules (intervening phrases, collective nouns, compound subjects); Pronoun ambiguity and number agreement; Dangling and misplaced modifiers; Parallel structure in lists and comparisons; Idiomatic preposition usage.',
        'subject_rule': 'State the relevant grammatical rule; show the sentence context; explain why the correction works and why common distractors fail.'
    },
    {
        'num': '39',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'grammar', 'top_name': 'Grammar & Usage',
        'sub_slug': 'fill-in-the-blanks', 'sub_name': 'Fill in the Blanks',
        'skills': 'Solve single and double blank sentence completions; interpret transitional indicators (contrast, support, condition); verify grammatical harmony of candidate word pairs.',
        'concepts': 'Signal words for contrast (although, despite, whereas) and continuity (furthermore, because, consequently); Prediction before looking at choices; Double blank balance and simultaneous elimination.',
        'subject_rule': 'Explain the logical relationship established by transitional adverbs; verify part of speech and semantics.'
    },
    {
        'num': '40',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'vocabulary', 'top_name': 'Vocabulary',
        'sub_slug': 'synonyms-and-antonyms', 'sub_name': 'Synonyms & Antonyms',
        'skills': 'Determine contextual meanings of high-frequency exam words; identify primary and secondary word definitions; apply root words, prefixes, and suffixes to deduce unknown terms.',
        'concepts': 'Etymology and morphology (Latin and Greek roots, prefixes, suffixes); Contextual meaning vs dictionary definition; Connotation and register (positive, negative, neutral); Antonym elimination traps.',
        'subject_rule': 'Give clear contextual examples; explain that near-synonyms are not universally interchangeable; include etymology roots.'
    },
    {
        'num': '41',
        'sec_slug': 'verbal-ability', 'sec_name': 'Verbal Ability',
        'top_slug': 'vocabulary', 'top_name': 'Vocabulary',
        'sub_slug': 'idioms-and-phrases', 'sub_name': 'Idioms & Phrases',
        'skills': 'Interpret common English idioms, figurative expressions, and phrasal verbs; apply them accurately in sentence contexts without literal translation errors.',
        'concepts': 'Idiomatic expressions in professional and exam contexts; Difference between literal and figurative meaning; Common phrasal verbs (e.g. look into, put off, call on); Prepositional idioms.',
        'subject_rule': 'Provide origin context where helpful; demonstrate realistic usage sentences in modern English.'
    },

    # Data Interpretation (6)
    {
        'num': '42',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'tables-and-caselets', 'top_name': 'Tables & Caselets',
        'sub_slug': 'tables', 'sub_name': 'Tables',
        'skills': 'Extract tabular data accurately; compute row/column sums, percentage shares, growth rates, and ratios; apply rapid mental estimation techniques.',
        'concepts': 'Table header and unit examination; Calculation shortcuts (10% and 1% method for percentages); Absolute growth vs percentage growth; Ratio comparison techniques without long division.',
        'subject_rule': 'Include a clean Markdown data table with original numbers; explain units and rounding; verify all answers derive strictly from the table.'
    },
    {
        'num': '43',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'tables-and-caselets', 'top_name': 'Tables & Caselets',
        'sub_slug': 'caselets', 'sub_name': 'Caselets',
        'skills': 'Convert unstructured descriptive paragraphs into structured tables or Venn diagrams; deduce missing numerical values; answer multi-question sets from textual data.',
        'concepts': 'Data organization strategy: identify entities, variables, and periods; Translating relationships into equations; Solving independent variables first; Consistency check across derived values.',
        'subject_rule': 'Provide a concise, realistic original caselet paragraph; show the exact conversion steps into a structured table.'
    },
    {
        'num': '44',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'charts', 'top_name': 'Charts',
        'sub_slug': 'bar-charts', 'sub_name': 'Bar Charts',
        'skills': 'Interpret single, grouped, and stacked/subdivided bar charts; read axis scales and baseline offsets; compute percentage changes and comparative ratios.',
        'concepts': 'Single bar chart values; Grouped/clustered bar charts for multi-category comparison; Stacked bar charts (absolute vs 100% percentage stacked); Visual estimation and scale verification.',
        'subject_rule': 'Represent the bar chart data in a transparent tabular format alongside textual visualization description; verify scale calculations.'
    },
    {
        'num': '45',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'charts', 'top_name': 'Charts',
        'sub_slug': 'line-graphs', 'sub_name': 'Line Graphs',
        'skills': 'Read single and multiple trend lines across continuous time periods; calculate compound annual growth rate (CAGR), maximum slope/rate of change, and period-over-period variations.',
        'concepts': 'Interpreting trend curves; Slope as rate of change; Multi-line graphs and legend tracking; Cumulative vs point-in-time metrics; Break-even and intersection points.',
        'subject_rule': 'Define data points clearly in text/table; check that rate of increase vs absolute increase are distinctly addressed.'
    },
    {
        'num': '46',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'charts', 'top_name': 'Charts',
        'sub_slug': 'pie-charts', 'sub_name': 'Pie Charts',
        'skills': 'Convert degrees to percentages (360 deg = 100%, 1% = 3.6 deg); calculate sector values from total amounts; analyze dual pie charts (e.g. expenditure vs revenue).',
        'concepts': 'Degree to percentage conversion factor (3.6); Proportionate distribution; Dual pie chart analysis (ensuring separate base totals are not conflated); Difference between two sectors in degrees vs value.',
        'subject_rule': 'Always state whether sectors represent percentages or degrees; enforce sum = 100% (or 360 degrees); warn against adding percentages from different total bases.'
    },
    {
        'num': '47',
        'sec_slug': 'data-interpretation', 'sec_name': 'Data Interpretation',
        'top_slug': 'mixed-di', 'top_name': 'Mixed',
        'sub_slug': 'mixed-graphs', 'sub_name': 'Mixed Graphs',
        'skills': 'Synthesize correlated information across complementary representations (e.g. Pie Chart + Table, Bar Chart + Line Graph); execute multi-stage calculations.',
        'concepts': 'Cross-referencing parameters; Using one visual to obtain total values and the second for demographic breakdowns; Handling missing percentage variables across charts.',
        'subject_rule': 'Ensure the combined data model is mathematically consistent; illustrate the step-by-step cross-referencing process.'
    },

    # Technical Aptitude (6)
    {
        'num': '48',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'programming', 'top_name': 'Programming',
        'sub_slug': 'output-prediction', 'sub_name': 'Output Prediction',
        'skills': 'Trace code execution step-by-step; track variable scopes, pre/post increment operators, pointer arithmetic, recursion stacks, and loop termination conditions.',
        'concepts': 'Evaluation order and operator precedence in C/C++/Java; Post-increment (x++) vs pre-increment (++x); Static variables and scope persistence; Recursion call stacks and base cases; Pointer dereferencing and arrays.',
        'subject_rule': 'Specify language and version assumptions; provide clean, formatted code blocks; build an explicit memory/variable execution trace table.'
    },
    {
        'num': '49',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'programming', 'top_name': 'Programming',
        'sub_slug': 'oop', 'sub_name': 'Object-Oriented Programming',
        'skills': 'Apply core OOP pillars (Encapsulation, Abstraction, Inheritance, Polymorphism); distinguish method overloading from overriding; understand virtual functions and abstract classes.',
        'concepts': 'Classes, objects, constructors, destructors; Access modifiers (public, private, protected); Compile-time vs runtime polymorphism (method overloading vs overriding); Abstract classes vs interfaces; Dynamic binding and virtual method table (vtable).',
        'subject_rule': 'Use clean C++/Java syntax; trace method resolution during inheritance calls; contrast interface contracts with abstract class inheritance.'
    },
    {
        'num': '50',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'programming', 'top_name': 'Programming',
        'sub_slug': 'dsa', 'sub_name': 'Data Structures & Algorithms',
        'skills': 'Analyze asymptotic time and space complexities (Big O); evaluate operations on Arrays, Linked Lists, Stacks, Queues, Binary Trees, and Hash Maps; implement basic sorting and searching.',
        'concepts': 'Big O notation (worst, average, best case); Array vs Linked List trade-offs; Stack (LIFO) and Queue (FIFO) applications; Binary Search Tree (BST) traversals (inorder, preorder, postorder); Bubble, Merge, and Quick Sort complexities.',
        'subject_rule': 'State Big-O complexity for every operation; show dry runs of algorithms on sample arrays.'
    },
    {
        'num': '51',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'cs-fundamentals', 'top_name': 'CS Fundamentals',
        'sub_slug': 'dbms', 'sub_name': 'DBMS',
        'skills': 'Apply Relational Model concepts; write and interpret SQL queries (SELECT, JOIN, GROUP BY, HAVING); evaluate Normal Forms (1NF, 2NF, 3NF, BCNF); understand ACID properties.',
        'concepts': 'Entity-Relationship (ER) model and keys (Primary, Foreign, Candidate, Super); SQL Joins (INNER, LEFT, RIGHT, FULL); Normalization and functional dependencies; ACID transaction properties; Indexing basics (B-Trees).',
        'subject_rule': 'Provide sample relation schemas and concrete SQL queries with input tables and output result sets.'
    },
    {
        'num': '52',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'cs-fundamentals', 'top_name': 'CS Fundamentals',
        'sub_slug': 'operating-systems', 'sub_name': 'Operating Systems',
        'skills': 'Differentiate processes and threads; analyze CPU scheduling algorithms (FCFS, SJF, Round Robin); evaluate deadlock conditions and avoidance (Banker\'s algorithm); understand virtual memory and paging.',
        'concepts': 'Process life cycle states; Context switching and PCB; Preemptive vs non-preemptive CPU scheduling and Gantt chart calculation; 4 Coffman deadlock conditions; Paging, page faults, and replacement algorithms (FIFO, LRU).',
        'subject_rule': 'Include turnaround time and waiting time calculations for scheduling examples; explain page table address translation.'
    },
    {
        'num': '53',
        'sec_slug': 'technical-aptitude', 'sec_name': 'Technical Aptitude',
        'top_slug': 'cs-fundamentals', 'top_name': 'CS Fundamentals',
        'sub_slug': 'computer-networks', 'sub_name': 'Computer Networks',
        'skills': 'Differentiate OSI and TCP/IP protocol layers; understand IP addressing and subnetting (CIDR); compare TCP (connection-oriented) and UDP; analyze DNS, HTTP, and routing fundamentals.',
        'concepts': '7-layer OSI model functions; IPv4 classful addressing vs CIDR subnetting; Subnet mask calculation and usable host ranges; TCP 3-way handshake and flow/congestion control; Application layer protocols (HTTP, HTTPS, DNS, DHCP).',
        'subject_rule': 'Demonstrate step-by-step binary/decimal subnet calculations; trace packet encapsulation across protocol layers.'
    }
]

os.makedirs('prompts/public-resources/subtopics', exist_ok=True)

index_lines = [
    '# Aptric Public Resources — Subtopic Content Index',
    '',
    '> Complete numbered catalogue linking all 53 canonical subtopics to their content briefs and public routes.',
    '',
    '| # | ID | Section | Topic | Subtopic | Prompt File | Canonical Route | Target Words | Status |',
    '|---|---|---|---|---|---|---|---|---|'
]

for st in subtopics_data:
    filename = f"{st['num']}-{st['sec_slug']}--{st['top_slug']}--{st['sub_slug']}.md"
    file_rel = f"subtopics/{filename}"
    doc_id = f"APT-PUB-{st['num']}"
    route = f"/resources/{st['sec_slug']}/{st['top_slug']}/{st['sub_slug']}"
    target_words = "1,800 – 3,200"
    status = "Active Brief"

    index_lines.append(f"| {int(st['num'])} | `{doc_id}` | {st['sec_name']} | {st['top_name']} | **{st['sub_name']}** | [{filename}]({file_rel}) | `{route}` | {target_words} | {status} |")

    prompt_path = os.path.join('prompts/public-resources/subtopics', filename)
    skill_bullets = '\n'.join(['- ' + s.strip() for s in st['skills'].split(';') if s.strip()])
    concept_bullets = '\n'.join(['- ' + c.strip() for c in st['concepts'].split(';') if c.strip()])

    content = f"""# Content Brief: {st['sec_name']} › {st['top_name']} › {st['sub_name']}

> **Document ID:** `{doc_id}`  
> **Section:** {st['sec_name']} (`{st['sec_slug']}`)  
> **Topic:** {st['top_name']} (`{st['top_slug']}`)  
> **Subtopic:** {st['sub_name']} (`{st['sub_slug']}`)  
> **Canonical Public Route:** `/resources/{st['sec_slug']}/{st['top_slug']}/{st['sub_slug']}`  
> **Short Public Route:** `/resources/{st['sec_slug']}/{st['sub_slug']}`  
> **Target Word Count:** 1,800 – 3,200 words of rigorous, original educational material.

---

## 1. Learning Objectives & Observable Skills

Upon completing this learning module, the student will be able to:
{skill_bullets}

---

## 2. Core Concepts & Required Coverage

The educational resource must provide clear, step-by-step theoretical exposition and practical application for:
{concept_bullets}

---

## 3. Required 20-Point Content Specification

Follow the standardized 20-point structure required for all Aptric educational resources:

1. **Title & Learning Objective:** Clear, authoritative heading and explicit mastery statement.
2. **Short Introduction:** Plain-language definition explaining the concept and its direct relevance in competitive exams and campus placements.
3. **Prerequisites:** Prior mathematical, logical, or programming foundations needed, with contextual internal links.
4. **Core Concepts & Theory:** The underlying first-principles reasoning and mechanics. Avoid isolated rote rules.
5. **Definitions & Mathematical Notation:** Rigorous definition of every variable, notation, and unit before first use.
6. **Formula & Reference Section:** Clean KaTeX formulas (`$...$` and `$$...$$`), stating domain of validity, assumptions, and units.
7. **Step-by-Step Worked Examples:** At least 3 original, independently checked examples of increasing difficulty:
   - *Example 1 (Foundational / Easy):* Single formula application; establishes mechanics.
   - *Example 2 (Standard / Medium - Placement Level):* Multi-step problem typical of TCS NQT, Infosys, AMCAT, or Banking Prelims.
   - *Example 3 (Advanced / Hard - CAT / Bank PO Level):* Complex scenario with constraints or edge cases.
   Each example must have: Problem Statement, Step-by-Step Solution with explanation, Verification step, and Final Answer.
8. **Alternative Methods & Shortcuts:** Fast, valid shortcut (e.g. mental math, ratio balance, alligation, code deduction). Explicitly detail **when the shortcut works and when it fails**.
9. **Tips & Speed Tricks:** 3–5 practical memory aids, pattern recognition shortcuts, or speed estimation techniques.
10. **Common Mistakes & Pitfalls:** 3–4 classic errors candidates make, why they happen, and the exact corrective technique.
11. **Difficulty Progression Guide:** Summary table comparing Easy vs Medium vs Hard problem patterns in this subtopic.
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

## 4. Subject-Specific Content Instructions

{st['subject_rule']}

---

## 5. Accuracy & Originality Contract

- **Accuracy Contract:** Solve every equation, calculation, and code trace independently. Ensure all options are mutually exclusive, arithmetic is 100% verified, and units match throughout.
- **Originality Contract:** Write from first principles in original wording. Do not copy questions from standard textbooks or existing websites. Use fresh numbers and realistic scenarios.
"""
    with open(prompt_path, 'w') as f:
        f.write(content.strip() + '\n')

with open('prompts/public-resources/CONTENT_INDEX.md', 'w') as f:
    f.write('\n'.join(index_lines) + '\n')

print(f"Generated 53 subtopic prompts and CONTENT_INDEX.md successfully.")
