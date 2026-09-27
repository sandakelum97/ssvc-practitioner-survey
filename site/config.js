// config.js — settings for the survey page.
// The page refuses to start while any value below still contains "PASTE".
//
// SUPABASE_PUBLISHABLE_KEY: use the PUBLISHABLE key only (Supabase:
// Project Settings > API Keys). It is designed to be public; the database
// allows it to insert answers and nothing else. NEVER put the secret key
// (or the legacy service_role key) here.
window.SURVEY_CONFIG = {
  SUPABASE_URL: "https://atwlzdbaspburcgrfxnz.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "PASTE publishable key",
  SURVEY_VERSION: "v1",

  RESEARCHER: "Tharaka Dissanayaka",
  SUPERVISOR: "Prof. Ruvan Abeysekara",
  PROGRAMME: "eMSc Information Security, CICRA Campus / Asia e University",
  CONTACT_EMAIL: "PASTE contact email",
  DATA_REGION: "South Asia (Mumbai, India)",

  CLOSES: "18 October 2026",
  WITHDRAW_BY: "18 October 2026",
  DELETE_RAW_BY: "17 January 2027",
  MINUTES: "35"
};
