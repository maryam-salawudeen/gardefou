import type { Severity } from "../types.js";
import { hasSegments, normalizeIdentifier } from "./util.js";

export interface PiCategory {
  id: string;
  label: string;
  severity: Severity;
  /** Sensitive within the meaning of Law 25 s. 12, or treated as sensitive by the OPC. */
  sensitive: boolean;
  /** Only flag declarations in schema-like files, because the words are common elsewhere. */
  schemaOnly: boolean;
  words: string[];
  note?: string;
}

export const PI_CATEGORIES: PiCategory[] = [
  {
    id: "government-id",
    label: "government identifier",
    severity: "high",
    sensitive: true,
    schemaOnly: false,
    words: [
      "sin", "sin_number", "social_insurance_number", "social_insurance", "ssn", "nas",
      "passport_number", "passport_no", "drivers_license", "drivers_licence", "driver_license", "driver_licence",
      "health_card", "health_card_number", "health_number", "ramq", "ohip", "phn",
    ],
    note:
      "The OPC advises against collecting the SIN unless a law requires it (payroll and tax slips are the usual cases) and against ever using it as a general identifier.",
  },
  {
    id: "health",
    label: "health information",
    severity: "high",
    sensitive: true,
    schemaOnly: false,
    words: [
      "diagnosis", "diagnoses", "medical_history", "medical_condition", "medical_record", "medical_notes",
      "medication", "medications", "prescription", "prescriptions", "health_condition", "disability",
      "mental_health", "allergies", "pregnancy", "pregnant", "symptoms",
    ],
  },
  {
    id: "biometric",
    label: "biometric information",
    severity: "high",
    sensitive: true,
    schemaOnly: false,
    words: ["biometric", "biometrics", "fingerprint", "faceprint", "face_embedding", "face_template", "voiceprint", "iris_scan", "retina_scan"],
    note:
      "Québec also requires you to tell the Commission d'accès à l'information before you create a database of biometric characteristics (Act to establish a legal framework for information technology, s. 45).",
  },
  {
    id: "intimate",
    label: "information about identity or beliefs",
    severity: "high",
    sensitive: true,
    schemaOnly: false,
    words: ["sexual_orientation", "gender_identity", "religion", "religious_affiliation", "ethnicity", "ethnic_origin", "race", "political_affiliation", "union_membership"],
  },
  {
    id: "financial",
    label: "financial information",
    severity: "medium",
    sensitive: true,
    schemaOnly: false,
    words: ["bank_account", "bank_account_number", "account_number", "transit_number", "institution_number", "card_number", "credit_card", "iban", "credit_score", "salary", "income"],
  },
  {
    id: "birth-date",
    label: "date of birth",
    severity: "medium",
    sensitive: false,
    schemaOnly: false,
    words: ["dob", "date_of_birth", "birth_date", "birthdate", "birthday"],
  },
  {
    id: "location",
    label: "precise location",
    severity: "medium",
    sensitive: false,
    schemaOnly: true,
    words: ["latitude", "longitude", "lat", "lng", "lon", "geolocation", "gps", "location_history", "coordinates"],
  },
  {
    id: "contact",
    label: "contact details",
    severity: "low",
    sensitive: false,
    schemaOnly: true,
    words: ["email", "email_address", "phone", "phone_number", "mobile_number", "mobile_phone", "home_address", "street_address", "address_line1", "postal_code", "zip_code"],
  },
  {
    id: "name",
    label: "name",
    severity: "low",
    sensitive: false,
    schemaOnly: true,
    words: ["first_name", "last_name", "full_name", "legal_name", "maiden_name"],
  },
];

// Short words collide with ordinary code ("Math.sin", "trace"), so they match
// only the whole identifier or its last segment ("patient_dob").
function matches(n: string, word: string): boolean {
  if (n === word) return true;
  if (word.length <= 4 && !word.includes("_")) return n.endsWith("_" + word);
  return hasSegments(n, word);
}

export function categoryOf(identifier: string): PiCategory | null {
  const n = normalizeIdentifier(identifier);
  for (const cat of PI_CATEGORIES) {
    if (cat.words.some((w) => matches(n, w))) return cat;
  }
  return null;
}
