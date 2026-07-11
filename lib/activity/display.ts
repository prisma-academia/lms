const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.client_login": "Learner signed in",
  "auth.logout": "Signed out",
  "grade.create": "Grade recorded",
  "message.send": "Message sent",
  "certificate.award": "Certificate awarded",
  "submission.create": "Submission received",
  "assignment.publish": "Assignment published",
  "fee.create": "Fee created",
  "enrollment.create": "Enrollment created",
  "course.publish": "Course published",
  "course.create": "Course created",
  "course.update": "Course updated",
  "user.create": "User invited",
  "user.update": "User updated",
  "client.create": "Learner created",
  "client.update": "Learner updated",
  "tenant.create": "Workspace created",
  "tenant.update": "Settings updated",
};

export function formatActivityAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/\./g, " · ");
}

export function formatActivityTarget(targetType: string | null, targetId: string | null): string {
  if (!targetType) return "—";
  if (!targetId) return targetType;
  return `${targetType}`;
}
