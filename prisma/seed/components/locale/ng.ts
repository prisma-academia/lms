/** Nigeria-focused demo tenant localization. */
export const NG_LOCALE = {
  tenantName: "Greenfield Academy Lagos",
  companyEmail: "hello@greenfieldacademy.ng",
  currency: "NGN",
  locale: "en-NG",
  timezone: "Africa/Lagos",
  primaryColor: "#8C6BFF",
} as const;

export const NG_PEOPLE = {
  owner: { email: "admin@demo.test", firstName: "Ada", lastName: "Okonkwo" },
  instructor: { email: "instructor@demo.test", firstName: "Kwame", lastName: "Adeyemi" },
  student: { email: "rashida@demo.test", firstName: "Rashida", lastName: "Haruna" },
  extraClients: [
    { email: "chidi@demo.test", firstName: "Chidi", lastName: "Eze" },
    { email: "amara@demo.test", firstName: "Amara", lastName: "Bello" },
  ],
} as const;

export const NG_GROUPS = {
  clientGroup: { name: "2026 WAEC Cohort", description: "Students preparing for WAEC 2026." },
  userGroup: { name: "Science Faculty", description: "Science and STEM instructors." },
} as const;
