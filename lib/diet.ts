// Shared chip lists for the Diet + Health UI. Used on /me and /family/[id]
// so the user picks from the same vocabulary.

// Dietary preferences (lifestyle / pattern, not allergy).
export const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "low-carb",
  "high-protein",
  "no pork",
  "no beef",
  "halal",
  "kosher",
];

// The "Big 9" FDA major allergens, plus a couple of common additions.
// Hard rules — recipe gen + Coach must never violate.
export const ALLERGENS = [
  "peanut",
  "tree nut",
  "shellfish",
  "fish",
  "milk / dairy",
  "egg",
  "soy",
  "wheat",
  "sesame",
];

// Common chronic conditions that change food choices.
// AI may reference but always defer to a clinician.
export const MEDICAL_CONDITIONS = [
  "type 1 diabetes",
  "type 2 diabetes",
  "pre-diabetes",
  "high blood pressure",
  "high cholesterol",
  "celiac disease",
  "IBS",
  "GERD / reflux",
  "kidney disease",
  "PCOS",
  "hypothyroid",
];
