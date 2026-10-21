// Guardian static demo settings (Vercel or any static host).
window.GUARDIAN_STATIC = {
  // analysis results exported from the Colab run (Log tab > Download results, or /content/guardian_run/results.json)
  results: "results.json",

  // the web copy of the video the analysis ran on: /content/guardian_run/stream.mp4 from Colab, renamed.
  // It must be that file (or a re-encode with the same frame rate and length), not the original camera file.
  // Can also be a full https:// URL if you host the video elsewhere.
  video: "stream.mp4",

  // folder with the step evidence frames (/content/guardian_run/evidence/*.jpg). Missing images are simply hidden.
  evidence: "evidence/",

  // Demo sign-in. When deployed on Vercel, /api/login checks the INSPECTOR_* / MANAGER_* environment variables
  // instead and these are only used if that function is not available (e.g. opening the folder locally).
  accounts: {
    inspector: { password: "guardian", role: "inspector", name: "Site inspector" },
    manager:   { password: "guardian", role: "manager",   name: "Operations manager" }
  },
  loginHint: "Demo: inspector / guardian or manager / guardian"
};
