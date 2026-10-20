import type { EducationalTopicContent } from '../types';

export const OOP_CONTENT: EducationalTopicContent = {
  documentId: 'APT-PUB-49',
  sectionSlug: 'technical-aptitude',
  sectionName: 'Technical Aptitude',
  topicSlug: 'programming',
  topicName: 'Programming',
  subtopicSlug: 'oop',
  subtopicName: 'Object-Oriented Programming',
  title: 'Object-Oriented Programming: Pillars, Polymorphism, and Memory Models',
  learningObjective:
    'Master the 4 fundamental OOP pillars, constructor execution order, compile-time vs runtime polymorphism, virtual method dispatch (vtable/vptr), abstract classes vs interfaces, and placement coding interview questions.',
  introduction:
    'Object-Oriented Programming (OOP) is an industry-standard programming paradigm that organizes software around data (objects) and behavior (methods) rather than sequential actions. Technical aptitude rounds in Indian campus recruitment (TCS Digital/Prime, Infosys DSE/SP, Cognizant, Wipro, Amazon, Product Startups) heavily test OOP principles to assess your software engineering design maturity and code comprehension.',
  prerequisites: [
    { title: 'Variables and Data Types' },
    { title: 'Functions and Memory Stack/Heap Basics' },
  ],
  coreConcepts: [
    {
      heading: '1. The Four Pillars of OOP',
      body: '- **Encapsulation:** Bundling data (attributes) and methods that operate on that data into a single unit (class), while restricting direct access using private/protected access modifiers to maintain data integrity.\n- **Abstraction:** Hiding complex implementation mechanics and exposing only essential interfaces (e.g. abstract classes and interfaces) to reduce system coupling.\n- **Inheritance:** Enabling a derived (sub)class to acquire fields and methods of an existing base (super)class, promoting code reuse and establishing an "IS-A" relationship.\n- **Polymorphism:** The ability of a message or function call to take multiple execution forms depending on the invoking object.',
    },
    {
      heading: '2. Compile-Time vs Runtime Polymorphism',
      body: '- **Compile-Time (Static / Early Binding):** Method Overloading and Operator Overloading. The compiler resolves the exact target function at compile time based on method signatures (parameter types and count). Return type alone is insufficient to overload.\n- **Runtime (Dynamic / Late Binding):** Method Overriding. A derived class provides a specific implementation of a virtual method declared in its parent class. Resolved at runtime using the Virtual Method Table (vtable) and pointer (vptr).',
    },
    {
      heading: '3. Constructor and Destructor Execution Order in Inheritance',
      body: 'When an object of a derived class is instantiated:\n1. Base class constructor runs FIRST (top of hierarchy downwards).\n2. Derived class constructor runs SECOND.\nWhen the object is destroyed:\n1. Derived class destructor runs FIRST.\n2. Base class destructor runs SECOND (bottom of hierarchy upwards).\n**Crucial rule:** In C++, base class destructors must ALWAYS be declared `virtual` if derived objects will be deleted through base class pointers; otherwise, memory leaks occur because derived destructors will never execute.',
    },
  ],
  definitionsAndNotation: [
    { term: 'Class vs Object', definition: 'A class is a blueprint or user-defined type; an object is a concrete instance allocated in memory.' },
    { term: 'Abstract Class', definition: 'A class that contains at least one pure virtual function (or abstract method); cannot be instantiated directly.' },
    { term: 'Interface', definition: 'A pure contract containing only method declarations (and default methods in modern Java/C#); supports multiple inheritance of type.' },
    { term: 'Virtual Method Table (vtable)', definition: 'An array of function pointers created per polymorphic class by the compiler to support dynamic dispatch.' },
  ],
  formulas: [
    {
      name: 'Constructor Execution Sequence',
      formula: '\\text{Base Constructor} \\longrightarrow \\text{Member Initializers} \\longrightarrow \\text{Derived Constructor Body}',
      explanation: 'Guarantees that inherited state is fully initialized before derived logic executes.',
      assumptions: 'In multiple inheritance, base constructors execute in the exact order of class declaration.',
    },
    {
      name: 'Dynamic Method Dispatch',
      formula: '\\text{objectPointer} \\longrightarrow \\text{vptr} \\longrightarrow \\text{vtable}[index]()',
      explanation: 'Indirection step that resolves overridden methods based on the actual runtime object type.',
      assumptions: 'Method must be declared virtual in C++ or non-final in Java.',
    },
  ],
  workedExamples: [
    {
      title: 'Example 1: Tracing Overloaded vs Overridden Method Dispatch',
      difficulty: 'medium',
      examContext: 'Infosys DSE / TCS Prime Technical Assessment',
      question:
        '**Consider the following Java code snippet:**\n```java\nclass Parent {\n    void print() { System.out.print("P "); }\n}\nclass Child extends Parent {\n    void print() { System.out.print("C "); }\n    void print(String s) { System.out.print(s + " "); }\n}\npublic class Main {\n    public static void main(String[] args) {\n        Parent obj = new Child();\n        obj.print();\n    }\n}\n```\nWhat is the exact terminal output?',
      solution:
        '1. Examine variable declaration: `Parent obj = new Child();`\n   - Reference type is `Parent`.\n   - Actual runtime object created in heap is `Child`.\n2. In Java, all non-static, non-final methods are virtual by default (dynamic dispatch).\n3. When `obj.print()` is invoked:\n   - Compiler verifies that `print()` exists in class `Parent` (Compilation passes).\n   - At runtime, JVM inspects the actual object type (`Child`).\n   - JVM invokes `Child`\'s overridden `print()` method.\n4. Output is "C ".',
      verification: 'If `obj` were cast or called with `obj.print("Hello")`, it would fail at compile time because `print(String)` is not declared in class `Parent`. The no-argument `print()` resolves dynamically to `Child`. Output: "C ". Verified.',
      answer: 'C ',
    },
    {
      title: 'Example 2: Multiple Inheritance and Diamond Problem',
      difficulty: 'hard',
      examContext: 'Amazon / Product Company Technical Round',
      question:
        'What is the "Diamond Problem" in object-oriented inheritance, and how do C++ and Java resolve it differently?',
      solution:
        '1. **Definition of Diamond Problem:** Occurs when class B and class C inherit from common base class A, and class D inherits from both B and C. If A has a method `display()`, class D inherits two ambiguous copies of A\'s members and methods via B and C.\n2. **C++ Resolution:** C++ supports multiple class inheritance. It resolves this ambiguity via **Virtual Inheritance**: `class B : virtual public A` and `class C : virtual public A`. This ensures only a single shared instance of base class A exists in memory for D.\n3. **Java Resolution:** Java prohibits multiple inheritance of classes altogether (`extends` allows only one parent class). Instead, Java supports multiple inheritance of type via **Interfaces** (`implements InterfaceA, InterfaceB`). If two interfaces provide conflicting default implementations, Java forces class D to explicitly override and resolve the conflict.',
      verification: 'In C++, without `virtual public A`, attempting to access `d.display()` generates compile error "request for member is ambiguous". In Java, `class D extends B, C` fails to compile immediately. Verified.',
      answer: 'C++ uses Virtual Base Classes (virtual inheritance); Java disallows multiple class inheritance and uses Interfaces.',
    },
    {
      title: 'Example 3: Distinguishing Overloading from Overriding',
      difficulty: 'easy',
      examContext: 'Original programming fundamentals example',
      question: 'A Java class declares `print(int value)` and `print(String value)`. A subclass declares `print(int value)` with the same signature as the parent method. Which mechanism applies to each change?',
      solution: '1. The two methods in the same class have different parameter types, so they are overloaded. The compiler selects an overload from the declared argument types.\n2. The subclass method has the same signature as the inherited method, so it overrides the parent method. For an overridable instance method, runtime dispatch selects the implementation for the actual object type.',
      verification: 'Calling `print(4)` resolves to the integer overload at compile time; if that method is overridden and the receiver is a subclass instance, the subclass implementation executes at runtime.',
      answer: 'Different parameter lists: overloading. Same inherited signature in a subclass: overriding.',
    },
  ],
  alternativeMethods: [
    {
      name: 'Composition Over Inheritance (HAS-A vs IS-A)',
      description:
        'Instead of subclassing (`class Car extends Engine`), embed the dependency as an instance field (`class Car { private Engine engine; }`). This prevents fragile base class coupling, eliminates diamond inheritance ambiguities, and allows dynamic swapping of behaviors at runtime.',
      whenValid: 'Recommended software design pattern for modular, testable enterprise codebases.',
      whenItFails: 'When true polymorphic substitutability (Liskov Substitution Principle) is required.',
    },
  ],
  tipsAndTricks: [
    'Method Overloading happens at compile time; Method Overriding happens at runtime.',
    'Constructors cannot be declared `abstract` or `static`.',
    'Private methods cannot be overridden because they are not visible to derived classes.',
    'In C++, if you have any virtual function, always make your destructor virtual.',
  ],
  commonMistakes: [
    {
      mistake: 'Thinking return type alone can overload a method in Java or C++.',
      whyItHappens: 'Assuming `int calculate()` and `void calculate()` are valid overloads.',
      howToAvoid: 'The compiler cannot determine which method to call if parameters are identical (e.g. `calculate();`). Overloads MUST differ in parameter count or parameter types.',
    },
    {
      mistake: 'Failing to declare virtual destructors in polymorphic C++ base classes.',
      whyItHappens: 'Deleting a derived instance through a base pointer causes only the base destructor to execute, leaking derived memory.',
      howToAvoid: 'Always declare `virtual ~BaseClass() {}`.',
    },
  ],
  difficultyProgression: [
    {
      level: 'Foundational (Easy)',
      characteristics: 'Defining classes, public vs private access, simple single inheritance.',
      typicalExam: 'TCS NQT, Wipro Elite.',
    },
    {
      level: 'Standard (Medium)',
      characteristics: 'Overloading vs overriding rules, `super`/`this` usage, abstract classes vs interfaces.',
      typicalExam: 'Infosys DSE, Cognizant GenC Next, Capgemini.',
    },
    {
      level: 'Advanced (Hard)',
      characteristics: 'Virtual destructors, vtable memory dispatch, diamond problem resolution, SOLID principles.',
      typicalExam: 'TCS Prime, Amazon SDE-1, Product startups.',
    },
  ],
  practiceQuestions: [
    {
      id: 'oop-pq-1',
      stem: 'Which of the following is NOT a valid characteristic of an Interface in standard Java (pre-Java 8)?',
      options: [
        'All fields are implicitly public, static, and final.',
        'Methods can have concrete method bodies.',
        'A class can implement multiple interfaces.',
        'An interface cannot be instantiated with the new keyword.',
      ],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'In classic Java (prior to Java 8 default/static methods), all interface methods were purely abstract with no method bodies. Option B is therefore the false characteristic.',
    },
    {
      id: 'oop-pq-2',
      stem: 'In C++, what is stored inside an object of a class that has at least one virtual function?',
      options: [
        'The entire code of all virtual functions.',
        'A copy of the compiler\'s symbol table.',
        'A vptr (virtual pointer) pointing to the class vtable.',
        'An integer representing the memory address of the class definition.',
      ],
      correctIndex: 2,
      difficulty: 'medium',
      explanation:
        'The compiler embeds an invisible hidden pointer called `vptr` inside the object instance. This pointer points to the class\'s shared `vtable` containing addresses of the virtual methods.',
    },
    {
      id: 'oop-pq-3',
      stem: "Which principle means keeping an object's internal state behind a controlled public interface?",
      options: ['Encapsulation', 'Recursion', 'Compilation', 'Iteration'],
      correctIndex: 0,
      difficulty: 'easy',
      explanation: 'Encapsulation groups state and behavior and controls access through a public interface, reducing unintended direct modification.',
    },
    {
      id: 'oop-pq-4',
      stem: 'In Java, a subclass method with the same signature as an accessible, non-final instance method in its superclass is an example of what?',
      options: ['Overloading', 'Overriding', 'Constructor chaining only', 'Primitive conversion'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation: 'A matching inherited instance-method signature is overriding. Overloading instead uses different parameter lists.',
    },
    {
      id: 'oop-pq-5',
      stem: 'Why should a polymorphic C++ base class generally have a virtual destructor when objects may be deleted through base pointers?',
      options: ['To make every method virtual', 'To ensure the derived destructor is called', 'To prevent inheritance', 'To allocate the vtable on the stack'],
      correctIndex: 1,
      difficulty: 'medium',
      explanation: 'Deleting a derived object through a base pointer requires a virtual base destructor for defined polymorphic destruction and the proper derived-to-base destructor sequence.',
    },
  ],
  revisionSummary: [
    '4 Pillars: Encapsulation (data hiding), Abstraction (interface contract), Inheritance (code reuse), Polymorphism (multiple forms).',
    'Compile-time: Overloading (signature must differ in parameters).',
    'Runtime: Overriding (same signature, dynamic dispatch via vtable).',
    'Construction: Base runs first. Destruction: Derived runs first.',
  ],
  faqs: [
    {
      question: 'Can constructors be private in OOP?',
      answer:
        'Yes. A class with a private constructor cannot be instantiated from external code. This is the cornerstone of the Singleton Design Pattern and utility helper classes (like `java.lang.Math`).',
    },
    {
      question: 'What is the Liskov Substitution Principle (LSP)?',
      answer:
        'LSP states that objects of a derived class must be able to replace objects of the base class without breaking the correctness or expectations of the program.',
    },
    {
      question: 'Can a subclass override a private Java method?',
      answer: 'No. A private method is not inherited as an accessible method by the subclass, so a same-named method in the subclass is a separate declaration rather than an override.',
    },
  ],
  relatedTopics: [
    {
      title: 'Output Prediction',
      href: '/resources/technical-aptitude/programming/output-prediction',
      relationship: 'parallel',
      description: 'Traces execution state and variable scopes during real runtime evaluation.',
    },
    {
      title: 'Data Structures & Algorithms',
      href: '/resources/technical-aptitude/programming/dsa',
      relationship: 'next-step',
      description: 'Builds complex custom data structures utilizing OOP class representations.',
    },
  ],
  editorialReview: 'Editorial review pending; this material has not been independently certified.',
};
