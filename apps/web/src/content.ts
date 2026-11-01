import type { Locale, PathwayId } from "./types";
export const pathways: {
  id: PathwayId;
  name: string;
  short: string;
  description: string;
  study: string;
  subjects: string;
  possibilities: string[];
  consider: string;
  duration: string;
}[] = [
  {
    id: "fyjc_science",
    name: "FYJC Science",
    short: "Science",
    description:
      "Ask why things work. Explore the natural world through experiments, mathematics and observation.",
    study:
      "A foundation in scientific ideas, with subject combinations chosen at the college.",
    subjects: "Mathematics, science and an interest in asking questions.",
    possibilities: [
      "Engineering and technology",
      "Medicine and allied sciences",
      "Pure sciences and research",
    ],
    consider:
      "Subject combinations and entrance requirements vary. Check the route you want before choosing your subjects.",
    duration: "Classes 11–12",
  },
  {
    id: "fyjc_commerce",
    name: "FYJC Commerce",
    short: "Commerce",
    description:
      "Understand how businesses, markets and money work, and how people turn an idea into an enterprise.",
    study:
      "Accountancy, economics and business studies, with options that depend on the college.",
    subjects:
      "Comfort with numbers, reasoning and everyday business questions.",
    possibilities: [
      "Accounting and finance",
      "Business and management",
      "Economics and entrepreneurship",
    ],
    consider:
      "Mathematics requirements differ across later courses. Keep your future options in mind when choosing subjects.",
    duration: "Classes 11–12",
  },
  {
    id: "fyjc_arts",
    name: "FYJC Arts",
    short: "Arts & humanities",
    description:
      "Explore people, language, ideas and creative expression. There is more than one way to make an impact.",
    study:
      "Humanities, social sciences, languages and creative subjects, depending on the college.",
    subjects:
      "Curiosity about people, reading, communication and the world around you.",
    possibilities: [
      "Humanities and social sciences",
      "Design and communication",
      "Law and public service",
    ],
    consider:
      "Specific subjects, portfolios or entrance tests may be needed later. Explore the requirements of courses that interest you.",
    duration: "Classes 11–12",
  },
  {
    id: "polytechnic_diploma",
    name: "Polytechnic diploma",
    short: "Polytechnic",
    description:
      "Learn by making, testing and building. Explore a practical foundation in engineering and technology.",
    study:
      "Technical concepts alongside workshops, laboratories and applied projects.",
    subjects:
      "Mathematics, science and a willingness to learn through practice.",
    possibilities: [
      "Technical employment",
      "Further engineering study",
      "Applied design and manufacturing",
    ],
    consider:
      "Diploma-to-degree entry rules vary. Verify current admissions and recognition for the particular program.",
    duration: "Check the program",
  },
  {
    id: "iti_trade",
    name: "ITI trade",
    short: "ITI",
    description:
      "Build a specific skill through focused, hands-on training in a trade that interests you.",
    study:
      "Trade-specific practical work and theory in an Industrial Training Institute.",
    subjects:
      "An interest in hands-on work; subject requirements depend on the trade.",
    possibilities: [
      "Skilled trade work",
      "Apprenticeships",
      "Further skill development",
    ],
    consider:
      "Trade eligibility, recognition and training periods vary. Confirm these details on the official DVET portal.",
    duration: "Varies by trade",
  },
  {
    id: "vocational",
    name: "Vocational courses",
    short: "Vocational",
    description:
      "Explore focused, work-related learning across creative, technical and service fields.",
    study:
      "Skills tied to a particular area of work, through a recognized course.",
    subjects: "Your interests and the requirements of the specific course.",
    possibilities: [
      "Job-related skills",
      "Self-employment",
      "Further recognized training",
    ],
    consider:
      "Recognition matters. Check the awarding body, course requirements and progression options before applying.",
    duration: "Varies by course",
  },
];
export const route = (id?: string | null) => pathways.find((p) => p.id === id);
export const districts = [
  "Ahilyanagar",
  "Akola",
  "Amravati",
  "Beed",
  "Bhandara",
  "Buldhana",
  "Chandrapur",
  "Chhatrapati Sambhajinagar",
  "Dharashiv",
  "Dhule",
  "Gadchiroli",
  "Gondia",
  "Hingoli",
  "Jalgaon",
  "Jalna",
  "Kolhapur",
  "Latur",
  "Mumbai City",
  "Mumbai Suburban",
  "Nagpur",
  "Nanded",
  "Nandurbar",
  "Nashik",
  "Palghar",
  "Parbhani",
  "Pune",
  "Raigad",
  "Ratnagiri",
  "Sangli",
  "Satara",
  "Sindhudurg",
  "Solapur",
  "Thane",
  "Wardha",
  "Washim",
  "Yavatmal",
];
export const checklistLabels: Record<string, string> = {
  review_official_admission_rules: "Read the current official admission rules",
  prepare_result_copy: "Keep a copy of your confirmed result",
  check_identity_and_residence_documents:
    "Check identity and residence documents",
  check_optional_category_documents_if_applicable:
    "Check optional category documents, if applicable",
  compare_programs_and_costs: "Compare programs and the costs you know",
  apply_yourself_on_official_portal: "Apply yourself on the official portal",
};
export const statusLabels: Record<string, string> = {
  interested: "Interested",
  shortlisted: "Shortlisted",
  preparing_documents: "Preparing documents",
  applied_reported: "Applied (you reported)",
  allotted_reported: "Allotted (you reported)",
  admitted_reported: "Admitted (you reported)",
  not_selected_reported: "Not selected (you reported)",
  withdrawn: "Withdrawn",
};
export const eligibilityLabels: Record<string, string> = {
  eligible_by_known_rules: "Meets known requirements",
  not_eligible: "Does not meet a known requirement",
  needs_more_info: "More information needed",
  rules_not_verified: "Admission rules not verified",
};
export const cutoffLabels: Record<string, string> = {
  comparable: "Comparable historical record",
  not_comparable: "Historical record not comparable",
  no_cutoff_record: "No published cutoff record",
};
export const reasonLabels: Record<string, string> = {
  CATEGORY_NOT_PROVIDED: "No optional comparison category was provided.",
  QUOTA_MISMATCH:
    "The category, quota or other admission context does not match.",
  ROUND_NOT_SELECTED:
    "Choose an academic year and admission round for comparison.",
  METRIC_MISMATCH:
    "The published measure does not match the student aggregate.",
  AGGREGATE_RULE_UNVERIFIED:
    "The official board aggregate rule has not been verified.",
  RESULT_NOT_CONFIRMED: "Confirm a result before comparing historical marks.",
  YEAR_NOT_AVAILABLE: "No record exists for the selected academic year.",
};
export const criteriaLabels: Record<string, string> = {
  academic_fit: "Academic comparison",
  affordability: "Affordability",
  proximity: "Proximity",
  government: "Government management",
  hostel: "Hostel availability",
  medium: "Medium of instruction",
};
export const costLabels: Record<string, string> = {
  tuition: "Tuition",
  development_fee: "Development fee",
  exam_fee: "Exam fee",
  other_institutional: "Other institutional fees",
  hostel: "Hostel",
  mess_food: "Food & mess",
  local_transport: "Local transport",
  travel_home: "Travel home",
  books_supplies: "Books & supplies",
  other_personal: "Other personal costs",
};
export const sections: { key: string; label: string; description: string }[] = [
  {
    key: "academic_summary",
    label: "Academic summary",
    description: "Confirmed subjects and the entered-subject average.",
  },
  {
    key: "compass_summary",
    label: "Career Compass",
    description:
      "Exploratory routes and a short explanation. No raw game events.",
  },
  {
    key: "routes_and_alternatives",
    label: "Routes & alternatives",
    description: "Your selected goal and other routes you can explore.",
  },
  {
    key: "shortlist",
    label: "Saved colleges",
    description: "Source-linked offerings and the progress you reported.",
  },
  {
    key: "costs",
    label: "Costs",
    description:
      "Your latest comparison, with verified fees and estimates kept separate.",
  },
  {
    key: "next_steps",
    label: "Next steps",
    description: "Your preparation checklist and completed tasks.",
  },
  {
    key: "questions_to_discuss",
    label: "Questions to discuss",
    description: "Prompts for a useful family conversation.",
  },
  {
    key: "category_used_in_comparison",
    label: "Optional comparison category",
    description:
      "Sensitive information. Include only if you explicitly want to share it.",
  },
];
export const labels: Record<Locale, Record<string, string>> = {
  en: {
    home: "My journey",
    marks: "My marks",
    explore: "Explore pathways",
    compass: "Career Compass",
    colleges: "Find colleges",
    shortlist: "My shortlist",
    compare: "Compare costs",
    mentor: "Ask the mentor",
    report: "Parent report",
    data: "Our data",
    privacy: "Privacy & settings",
    demo: "Demo workspace",
    sample: "Sample marks only",
    next: "Your next step",
    unknown: "Not verified",
    estimate: "Your estimate",
    source: "View source",
    saved: "Saved",
    finder: "College Fit",
  },
  mr: {
    home: "माझा प्रवास",
    marks: "माझे गुण",
    explore: "शिक्षणाचे मार्ग",
    compass: "करिअर कंपास",
    colleges: "महाविद्यालये शोधा",
    shortlist: "माझी यादी",
    compare: "खर्चाची तुलना",
    mentor: "मार्गदर्शकाला विचारा",
    report: "पालकांसाठी अहवाल",
    data: "आमची माहिती",
    privacy: "गोपनीयता व सेटिंग्ज",
    demo: "डेमो कार्यक्षेत्र",
    sample: "फक्त नमुना गुण",
    next: "तुमचे पुढील पाऊल",
    unknown: "पडताळलेले नाही",
    estimate: "तुमचा अंदाज",
    source: "स्रोत पाहा",
    saved: "जतन केले",
    finder: "कॉलेज फिट",
  },
  hi: {
    home: "मेरी यात्रा",
    marks: "मेरे अंक",
    explore: "पढ़ाई के रास्ते",
    compass: "करियर कम्पास",
    colleges: "कॉलेज खोजें",
    shortlist: "मेरी सूची",
    compare: "खर्च की तुलना",
    mentor: "मार्गदर्शक से पूछें",
    report: "अभिभावक रिपोर्ट",
    data: "हमारा डेटा",
    privacy: "गोपनीयता व सेटिंग्स",
    demo: "डेमो कार्यक्षेत्र",
    sample: "केवल नमूना अंक",
    next: "आपका अगला कदम",
    unknown: "सत्यापित नहीं",
    estimate: "आपका अनुमान",
    source: "स्रोत देखें",
    saved: "सेव किया",
    finder: "कॉलेज फ़िट",
  },
};
export const reportLabels: Record<Locale, Record<string, string>> = {
  en: Object.fromEntries(sections.map((s) => [s.key, s.label])),
  mr: {
    academic_summary: "शैक्षणिक सारांश",
    compass_summary: "करिअर कंपास",
    routes_and_alternatives: "शिक्षणाचे मार्ग व पर्याय",
    shortlist: "निवडलेली महाविद्यालये",
    costs: "खर्च",
    next_steps: "पुढील पावले",
    questions_to_discuss: "चर्चेसाठी प्रश्न",
    category_used_in_comparison: "तुलनेसाठी निवडलेली श्रेणी",
  },
  hi: {
    academic_summary: "शैक्षणिक सारांश",
    compass_summary: "करियर कम्पास",
    routes_and_alternatives: "पढ़ाई के रास्ते और विकल्प",
    shortlist: "चुने हुए कॉलेज",
    costs: "खर्च",
    next_steps: "अगले कदम",
    questions_to_discuss: "चर्चा के सवाल",
    category_used_in_comparison: "तुलना के लिए चुनी गई श्रेणी",
  },
};
export const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IN").format(n);
export const money = (n: number | null | undefined) =>
  n == null
    ? "Not verified"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(n);
export const pretty = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
