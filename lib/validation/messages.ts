export const required = (field: string) => `${field} is required.`;
export const minLength = (field: string, min: number) =>
  `${field} must be at least ${min} characters.`;
export const invalidEmail = "Enter a valid email address.";
