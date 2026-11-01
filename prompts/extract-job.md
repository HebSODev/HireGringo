You extract structured data from a job posting. The posting is below.

Return ONLY a JSON object with exactly this shape:

{
  "title": string,
  "company": string | null,
  "seniority": string | null,      // e.g. "Junior", "Mid-level", "Senior", "Staff"
  "requirements": string[],        // must-have and nice-to-have skills/experience, most important first, max 12
  "stack": string[],               // languages, frameworks, databases, cloud, tools
  "responsibilities": string[],    // max 8
  "isTechRole": boolean            // true only for software/technology roles (engineering, data, DevOps, QA, security, product engineering, etc.)
}

Rules:
- Use only information explicitly present in the posting. Never add generic items (e.g. "collaborate with teams", "mentor juniors") that the posting does not state. An empty list is fine.
- Write the values in English, even if the posting is in another language.
- If the text is not a job posting at all, set "isTechRole" to false.

Job posting:
"""
{{text}}
"""
